from threading import Thread

from fastapi import FastAPI

from app.routers.chat import router as chat_router
from app.routers.files import router as files_router
from app.routers.auth import router as auth_router

from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.services.database_maintenance import ensure_database_shape
from app.services.file_rag_service import ensure_upload_folders
from app.services.local_title_service import preload_title_model
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
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def start_title_model_preload():
    Thread(
        target=preload_title_model,
        daemon=True,
    ).start()


@app.get("/")
def root():
    return {
        "message": "Backend is running successfully!"
    }
