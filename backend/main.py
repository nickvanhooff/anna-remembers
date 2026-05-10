from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import patients, chat

# Geen logica in dit bestand — alleen app-setup en router-registratie.
app = FastAPI(
    title="Anna Remembers API",
    description="Backend API voor de Anna Remembers gezondheidsassistent",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(chat.router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check — bevestigt dat de backend bereikbaar is."""
    return {"status": "ok"}
