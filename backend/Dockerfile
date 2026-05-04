FROM python:3.12-slim

WORKDIR /app

# Installeer dependencies als aparte Docker layer.
# Zolang requirements.txt niet verandert, gebruikt Docker de gecachte layer —
# zodat 'pip install' niet bij elke code-wijziging opnieuw draait.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# In development wordt de code overschreven door de volume mount in docker-compose.yml.
# COPY hier is de fallback voor productie (zonder volume mount).
COPY . .

# 1. Alembic voert alle uitstaande migraties uit voor de server start.
# 2. Uvicorn start met --reload: herstart bij elke .py wijziging (werkt via volume mount).
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"]
