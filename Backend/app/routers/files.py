from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.chat import (
    AttachedFileItem,
    AttachedFileListResponse,
    RenameFileRequest,
)
from app.services.file_rag_service import (
    delete_library_file,
    format_file,
    get_file_content,
    get_file_path,
    get_library_file,
    list_library_files,
    rename_library_file,
    upload_file_to_library,
)


router = APIRouter(
    prefix="/files",
    tags=["Files"],
)


@router.post("/upload", response_model=AttachedFileListResponse)
def upload_files(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return AttachedFileListResponse(
            files=[
                AttachedFileItem(
                    **upload_file_to_library(
                        db=db,
                        upload=file,
                        user_id=current_user.id,
                    )
                )
                for file in files
            ]
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


@router.get("/", response_model=AttachedFileListResponse)
def get_files(
    q: str | None = None,
    category: str | None = None,
    sort: str = "newest",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return AttachedFileListResponse(
        files=[
            AttachedFileItem(**file)
            for file in list_library_files(
                db=db,
                user_id=current_user.id,
                query=q,
                category=category,
                sort=sort,
            )
        ]
    )


@router.get("/search", response_model=AttachedFileListResponse)
def search_files(
    q: str = "",
    category: str | None = None,
    sort: str = "newest",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_files(
        q=q,
        category=category,
        sort=sort,
        db=db,
        current_user=current_user,
    )


@router.get("/download/{file_id}")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = _get_file_or_404(
        db=db,
        file_id=file_id,
        user_id=current_user.id,
    )
    path = get_file_path(file)

    if path is not None and path.exists():
        return FileResponse(
            path,
            media_type=file.mime_type or file.content_type or "application/octet-stream",
            filename=file.filename,
        )

    content = get_file_content(file)
    if content is not None:
        return Response(
            content=content,
            media_type=file.mime_type or file.content_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{file.filename}"',
            },
        )

    raise HTTPException(
        status_code=404,
        detail="File content not found",
    )


@router.get("/preview/{file_id}")
def preview_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = _get_file_or_404(
        db=db,
        file_id=file_id,
        user_id=current_user.id,
    )

    if (file.category or "") in {"archive", "others"}:
        return JSONResponse(format_file(file, created=False))

    path = get_file_path(file)

    if path is not None and path.exists():
        return FileResponse(
            path,
            media_type=file.mime_type or file.content_type or "application/octet-stream",
            filename=file.filename,
            headers={
                "Content-Disposition": f'inline; filename="{file.filename}"',
            },
        )

    content = get_file_content(file)
    if content is not None:
        return Response(
            content=content,
            media_type=file.mime_type or file.content_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'inline; filename="{file.filename}"',
            },
        )

    raise HTTPException(
        status_code=404,
        detail="File content not found",
    )


@router.get("/{file_id}", response_model=AttachedFileItem)
def get_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = _get_file_or_404(
        db=db,
        file_id=file_id,
        user_id=current_user.id,
    )

    return AttachedFileItem(
        **format_file(
            file=file,
            created=False,
        )
    )


@router.patch("/{file_id}/rename", response_model=AttachedFileItem)
def rename_file(
    file_id: int,
    request: RenameFileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = rename_library_file(
        db=db,
        file_id=file_id,
        user_id=current_user.id,
        filename=request.filename,
    )

    if file is None:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    return AttachedFileItem(**file)


@router.delete("/{file_id}")
def remove_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = delete_library_file(
        db=db,
        file_id=file_id,
        user_id=current_user.id,
    )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    return {
        "message": "File deleted successfully"
    }


def _get_file_or_404(
    db: Session,
    file_id: int,
    user_id: int,
):
    file = get_library_file(
        db=db,
        file_id=file_id,
        user_id=user_id,
    )

    if file is None:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    return file
