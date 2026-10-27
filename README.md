# StudyAI

StudyAI is a full-stack AI study assistant. Ask questions, chat with different AI providers, upload study files, and get explanations grounded in your attached documents.

## Features

- Account signup, login, and per-user chat history.
- Streaming chat with Gemini, NVIDIA Nemotron, and Cloudflare Workers AI Qwen models. Choose a model in the composer or set a default in Settings.
- Optional Tavily web search for current information and useful real-world images.
- File uploads and a personal Library with previews, downloads, rename, delete, and duplicate detection by SHA-256.
- Document text extraction, chunking, and retrieval for supported file types when asking questions about attached files.
- Automatic chat titles generated locally with Gemma 3 1B Instruct.
- Markdown responses with code highlighting, tables, math, and SVG diagrams.
- Appearance settings, including light/dark/system mode and selectable accent colors.

## Project Structure

```text
Backend/
  app/
    core/          Settings, database, and authentication security
    models/        SQLAlchemy models
    routers/       Authentication, chat, and file APIs
    schemas/       API request/response schemas
    services/      Model integrations, chat orchestration, search, files, and RAG
  storage/uploads/ Uploaded files and local vector-index data
Frontend/
  src/
    components/    Chat UI, composer, markdown rendering, and sidebar
    pages/         Landing, authentication, chat, library, and settings screens
    services/      Backend API clients
```

## Requirements

- Python 3.10 or newer (Python 3.11 recommended).
- Node.js 20.19+ or 22.12+.
- A database supported by SQLAlchemy. SQLite is the quickest local setup; PostgreSQL is also supported.
- API credentials for the model providers you plan to use. The current backend configuration requires `GEMINI_API_KEY` to be present at startup, even when selecting a different provider.

## Configure the Backend

Create `Backend/.env` with your local settings. Keep this file private and never commit real keys.

```dotenv
# SQLite database created in the Backend folder
DATABASE_URL=sqlite:///./studyai.db

# Required by the current settings configuration
GEMINI_API_KEY=your-gemini-api-key

# Optional provider keys; provide the key for each provider you want to use
NVIDIA_API_KEY=your-nvidia-api-key
CLOUDFLARE_API_KEY=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id

# Optional web search
TAVILY_API_KEY=your-tavily-api-key

# Optional Hugging Face token for downloading gated Gemma weights
HF_TOKEN=your-hugging-face-token

# Replace the development default with a long, random secret
JWT_SECRET_KEY=replace-with-a-long-random-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_DAYS=7

# Maximum size of one uploaded file, in megabytes
MAX_UPLOAD_MB=200
```

Only add provider keys you intend to use. If using PostgreSQL instead of SQLite, create the database first and set a URL such as:

```dotenv
DATABASE_URL=postgresql+psycopg2://username:password@localhost:5432/studyai
```

### Install and Run the Backend (PowerShell)

```powershell
cd Backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install torch transformers
python -m uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`. Interactive API documentation is at `http://localhost:8000/docs`.

The title feature uses `google/gemma-3-1b-it` through Transformers on CPU. The first startup downloads model weights from Hugging Face and can take time and disk space. For gated model access, accept the model's Hugging Face terms and configure `HF_TOKEN`. After it is cached locally, title generation runs locally. The app attempts to preload the model in a background thread.

## Install and Run the Frontend

In a second PowerShell terminal:

```powershell
cd Frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend API client currently targets `http://localhost:8000`; update `Frontend/src/services/api.ts` if your backend uses a different URL.

## Using the App

1. Open the landing page and create an account or log in.
2. Start a chat, choose a model in the composer, and send a message. Responses stream into the conversation.
3. Use Settings to set the default model, toggle web search, change the appearance, or select an accent color.
4. Attach files with the composer `+` button or upload them to Library. Files are stored under `Backend/storage/uploads/` and associated with your account.
5. Attach a file to a chat and ask about it. Supported text and document formats can be extracted and ranked into the model context; other files can still be stored and viewed/downloaded according to their type.

Uploads are limited by `MAX_UPLOAD_MB` (200 MB by default). Duplicate content is detected by SHA-256 and reuses the existing stored file. File extraction depends on the file format and installed optional parsers; unsupported formats may provide metadata rather than extracted text.

## API Overview

All API routes are served by FastAPI at `http://localhost:8000`.

| Area | Routes |
| --- | --- |
| Authentication | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Chats | `POST /chat/new`, `GET /chat/`, `GET /chat/{id}/messages`, `POST /chat/message`, `POST /chat/message/stream`, `PATCH /chat/{id}/rename`, `DELETE /chat/{id}` |
| Files | `POST /files/upload`, `GET /files/`, `GET /files/search`, `GET /files/{id}`, `GET /files/preview/{id}`, `GET /files/download/{id}`, `PATCH /files/{id}/rename`, `DELETE /files/{id}` |

Chat and file routes require an authenticated session. Signup/login issue an HTTP-only session cookie.

## Notes

- Database tables are created when the backend starts. Back up the database and `Backend/storage/uploads/` together.
- File contents, chat messages, and local title-model files may contain private data. Protect the database, uploads folder, and model cache accordingly.
- The default JWT secret is for development only. Set a unique `JWT_SECRET_KEY` before exposing the app beyond your own machine.
- Use `Ctrl+C` in each terminal to stop the backend and frontend development servers.
