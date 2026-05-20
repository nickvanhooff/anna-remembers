from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, escalations, patients, tts

# No logic in this file — app setup and router registration only.
app = FastAPI(
    title="Anna Remembers API",
    description="Backend API for the Anna Remembers health assistant",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(chat.router)
app.include_router(escalations.router)
app.include_router(tts.router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check — confirms the backend is reachable."""
    return {"status": "ok"}
