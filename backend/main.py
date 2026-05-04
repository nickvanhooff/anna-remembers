from fastapi import FastAPI

# Routers worden hier geïmporteerd zodra ze aangemaakt zijn (issue #2).
# Geen logica in dit bestand — alleen app-setup en router-registratie.

app = FastAPI(
    title="Anna Remembers API",
    description="Backend API voor de Anna Remembers gezondheidsassistent",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check — bevestigt dat de backend bereikbaar is."""
    return {"status": "ok"}
