"""Symptom trend endpoints.

GET /patients/{patient_id}/symptom-trends?weeks=8
    Returns weekly aggregated symptom scores for Recharts.

GET /patients/{patient_id}/symptom-observations/{session_id}
    Returns a single observation with clinical reasoning for the detail modal.
"""

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models.symptom_observation import SymptomObservation
from schemas.symptom_observation import SymptomObservationRead, TrendPoint, TrendsResponse
from services.database import get_db
from services.mcp_client import MCPClient, get_mcp_client

router = APIRouter(prefix="/patients", tags=["symptom-trends"])


def _cutoff_week(weeks: int) -> tuple[int, int]:
    """Return (year, week_number) for `weeks` weeks ago from today."""
    now = datetime.now(timezone.utc)
    iso = now.isocalendar()
    total_weeks = iso.year * 52 + iso.week - weeks
    cutoff_year = total_weeks // 52
    cutoff_week = total_weeks % 52 or 52
    return cutoff_year, cutoff_week


@router.get(
    "/{patient_id}/symptom-trends",
    response_model=TrendsResponse,
    responses={404: {"description": "Patiënt niet gevonden"}},
)
def get_symptom_trends(
    patient_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    weeks: Annotated[int, Query(ge=1, le=52)] = 8,
) -> TrendsResponse:
    """Return weekly symptom scores for a patient over the last N weeks."""
    cutoff_year, cutoff_week = _cutoff_week(weeks)

    rows = (
        db.query(SymptomObservation)
        .filter(
            SymptomObservation.patient_id == patient_id,
            (SymptomObservation.year > cutoff_year)
            | (
                (SymptomObservation.year == cutoff_year)
                & (SymptomObservation.week_number >= cutoff_week)
            ),
        )
        .order_by(SymptomObservation.year.asc(), SymptomObservation.week_number.asc())
        .all()
    )

    data = [
        TrendPoint(
            week=f"{row.year}-W{row.week_number:02d}",
            dyspnea=row.dyspnea,
            edema=row.edema,
            fatigue=row.fatigue,
            medication=row.medication,
            weight_kg=row.weight_kg,
            session_id=row.session_id,
        )
        for row in rows
    ]

    return TrendsResponse(patient_id=patient_id, weeks=weeks, data=data)


@router.get(
    "/{patient_id}/symptom-observations/{session_id}",
    response_model=SymptomObservationRead,
    responses={404: {"description": "Observatie niet gevonden"}},
)
def get_symptom_observation(
    patient_id: uuid.UUID,
    session_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> SymptomObservation:
    """Return the symptom observation for a specific session, including clinical reasoning."""
    row = (
        db.query(SymptomObservation)
        .filter(
            SymptomObservation.patient_id == patient_id,
            SymptomObservation.session_id == session_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Observatie niet gevonden")
    return row


@router.get(
    "/{patient_id}/sessions/{session_id}/memories",
    response_model=list[dict],
)
async def get_session_memories(
    patient_id: uuid.UUID,
    session_id: uuid.UUID,
    mcp: Annotated[MCPClient, Depends(get_mcp_client)],
) -> list[dict]:
    """Return all ChromaDB memories stored during a specific session."""
    return await mcp.get_session_memories(
        patient_id=str(patient_id),
        session_id=str(session_id),
    )
