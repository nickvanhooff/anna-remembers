from fastapi import FastAPI

from routers import patients, chat

# Geen logica in dit bestand — alleen app-setup en router-registratie.
app = FastAPI(
    title="Anna Remembers API",
    description="Backend API voor de Anna Remembers gezondheidsassistent",
    version="0.1.0",
)

app.include_router(patients.router)
app.include_router(chat.router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check — bevestigt dat de backend bereikbaar is."""
    return {"status": "ok"}
