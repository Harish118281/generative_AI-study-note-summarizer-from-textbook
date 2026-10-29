from fastapi import FastAPI

from app.routers.chat import router as chat_router
from app.routers.files import router as files_router
from app.routers.auth import router as auth_router

from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.core.config import settings
from app.services.database_maintenance import ensure_database_shape
from app.services.file_rag_service import ensure_upload_folders
import app.models

Base.metadata.create_all(bind=engine)
ensure_database_shape()
ensure_upload_folders()

app = FastAPI(
    title="AI Study Notes Summarizer API",
    version="1.0.0"
)

app.include_router(chat_router)
app.include_router(files_router)
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in settings.FRONTEND_ORIGINS.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "Backend is running successfully!"
    }
