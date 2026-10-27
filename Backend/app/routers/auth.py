from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import SESSION_COOKIE, create_access_token, get_current_user
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, SignUpRequest
from app.services.auth_service import create_user, find_user_by_email, verify_password


router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_access_token(user),
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.JWT_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


@router.post("/signup", response_model=CurrentUserResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignUpRequest, response: Response, db: Session = Depends(get_db)):
    if find_user_by_email(db, payload.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = create_user(db, payload.name, payload.email, payload.password)
    _set_session_cookie(response, user)
    return user


@router.post("/login", response_model=CurrentUserResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = find_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    _set_session_cookie(response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(key=SESSION_COOKIE, path="/")


@router.get("/me", response_model=CurrentUserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
