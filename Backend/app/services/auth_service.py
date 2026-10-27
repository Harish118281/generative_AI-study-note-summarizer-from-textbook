import bcrypt
from sqlalchemy.orm import Session

from app.models.user import User


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def create_user(db: Session, name: str, email: str, password: str) -> User:
    user = User(
        name=name.strip(),
        email=email.strip().lower(),
        password_hash=bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
