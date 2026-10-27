from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.chat import (
    CreateChatRequest,
    CreateChatResponse,
    RenameChatRequest,
    ResumeMessageRequest,
    SendMessageRequest,
    SendMessageResponse,
    ChatListResponse,
    ChatDetailResponse,
    AttachedFileItem,
    AttachedFileListResponse,
)
from app.services.file_rag_service import (
    attach_upload_to_chat,
    detach_file_from_chat,
    get_file_path,
    get_library_file,
    list_library_files,
    list_chat_files,
    save_upload_to_library,
)
from app.services.chat_service import (
    create_chat,
    delete_chat,
    get_all_chats,
    get_chat,
    get_chat_model,
    rename_chat,
    send_message,
    stream_message,
)

from app.schemas.chat import ChatItem

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
)


@router.post("/new", response_model=CreateChatResponse)
def new_chat(
    request: CreateChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        chat = create_chat(db, request.title, current_user.id)

        return CreateChatResponse(
            id=chat.id,
            title=chat.title,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/message", response_model=SendMessageResponse)
def message(
    request: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return send_message(
            db=db,
            chat_id=request.chat_id,
            message=request.message,
            user_id=current_user.id,
            model=request.model,
            attached_file_ids=request.attached_file_ids,
            web_search_enabled=request.web_search_enabled,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/message/stream")
def message_stream(
    request: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if get_chat_model(db=db, chat_id=request.chat_id, user_id=current_user.id) is None:
        raise HTTPException(
            status_code=404,
            detail="Chat not found.",
        )

    return StreamingResponse(
        stream_message(
            db=db,
            chat_id=request.chat_id,
            message=request.message,
            user_id=current_user.id,
            model=request.model,
            attached_file_ids=request.attached_file_ids,
            web_search_enabled=request.web_search_enabled,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/message/stream/resume")
def resume_message_stream(
    request: ResumeMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if get_chat_model(db=db, chat_id=request.chat_id, user_id=current_user.id) is None:
        raise HTTPException(status_code=404, detail="Chat not found.")

    return StreamingResponse(
        stream_message(
            db=db,
            chat_id=request.chat_id,
            message="",
            user_id=current_user.id,
            model=request.model,
            web_search_enabled=request.web_search_enabled,
            resume_existing_message=True,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/message/stream/files")
def message_stream_with_files(
    chat_id: int = Form(...),
    message: str = Form(...),
    model: str | None = Form(None),
    web_search_enabled: bool = Form(True),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if get_chat_model(db=db, chat_id=chat_id, user_id=current_user.id) is None:
        raise HTTPException(
            status_code=404,
            detail="Chat not found.",
        )

    attached_file_ids: list[int] = []

    try:
        for upload in files:
            library_file, _created = save_upload_to_library(
                db=db,
                upload=upload,
                user_id=current_user.id,
            )
            attached_file_ids.append(library_file.id)
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )

    return StreamingResponse(
        stream_message(
            db=db,
            chat_id=chat_id,
            message=message,
            user_id=current_user.id,
            model=model,
            attached_file_ids=attached_file_ids,
            web_search_enabled=web_search_enabled,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/library/files", response_model=AttachedFileListResponse)
def get_library_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return AttachedFileListResponse(
            files=[
                AttachedFileItem(**file)
                for file in list_library_files(db, user_id=current_user.id)
            ]
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


@router.get("/library/files/{file_id}/content")
def get_library_file_content(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = get_library_file(
        db=db,
        file_id=file_id,
        user_id=current_user.id,
    )

    if file is None:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    media_type = file.content_type or "application/octet-stream"
    path = get_file_path(file)

    if path is not None and path.exists():
        return FileResponse(
            path,
            media_type=media_type,
            filename=file.filename,
            headers={
                "Content-Disposition": f'inline; filename="{file.filename}"',
            },
        )

    if file.file_data is None:
        raise HTTPException(
            status_code=404,
            detail="File content is not stored",
        )

    return Response(
        content=file.file_data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{file.filename}"',
        },
    )


@router.post("/{chat_id}/files", response_model=AttachedFileItem)
def upload_chat_file(
    chat_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if get_chat_model(db=db, chat_id=chat_id, user_id=current_user.id) is None:
        raise HTTPException(
            status_code=404,
            detail="Chat not found.",
        )

    try:
        return attach_upload_to_chat(
            db=db,
            chat_id=chat_id,
            upload=file,
            user_id=current_user.id,
        )

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


@router.get("/{chat_id}/files", response_model=AttachedFileListResponse)
def get_chat_files(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return AttachedFileListResponse(
            files=[
                AttachedFileItem(**file)
                for file in list_chat_files(
                    db=db,
                    chat_id=chat_id,
                    user_id=current_user.id,
                )
            ]
        )

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


@router.delete("/{chat_id}/files/{file_id}")
def remove_chat_file(
    chat_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        deleted = detach_file_from_chat(
            db=db,
            chat_id=chat_id,
            file_id=file_id,
            user_id=current_user.id,
        )

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Attached file not found",
            )

        return {
            "message": "File detached successfully"
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


@router.get("/", response_model=ChatListResponse)
def get_chats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        chats = get_all_chats(db, current_user.id)

        return ChatListResponse(
            chats=[
                ChatItem(
                    id=chat.id,
                    title=chat.title,
                )
                for chat in chats
            ]
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.get("/{chat_id}/messages", response_model=ChatDetailResponse)
def get_chat_messages(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        chat = get_chat(
            db=db,
            chat_id=chat_id,
            user_id=current_user.id,
        )

        if chat is None:
            raise HTTPException(
                status_code=404,
                detail="Chat not found",
            )

        return chat

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

@router.delete("/{chat_id}")
def remove_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        deleted = delete_chat(
            db=db,
            chat_id=chat_id,
            user_id=current_user.id,
        )

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Chat not found",
            )

        return {
            "message": "Chat deleted successfully"
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
        detail=str(e),
    )


@router.patch("/{chat_id}/rename", response_model=CreateChatResponse)
def rename_existing_chat(
    chat_id: int,
    request: RenameChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        chat = rename_chat(
            db=db,
            chat_id=chat_id,
            user_id=current_user.id,
            title=request.title,
        )

        if chat is None:
            raise HTTPException(
                status_code=404,
                detail="Chat not found.",
            )

        return CreateChatResponse(
            id=chat.id,
            title=chat.title,
        )

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )
