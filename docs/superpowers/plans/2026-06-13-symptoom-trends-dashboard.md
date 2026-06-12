# Plan: Symptoom Trends Dashboard

**Datum:** 2026-06-13
**Branch:** feature/symptoom-trends

---

## Volgorde van implementatie

```
1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 2.4 → 3.1 → 3.2
```

---

## Bestaande patronen — volg deze altijd

| Wat | Waar te vinden | Wat overnemen |
|---|---|---|
| SQLAlchemy tabelmodel | `backend/models/patient.py` | Kolom-declaraties, UUID PK, FK-syntax |
| Alembic migratie met tabel aanmaken | `backend/alembic/versions/0001_initial_schema.py` | `op.create_table()` structuur, `op.drop_table()` in downgrade |
| BackgroundTask in chat router | `backend/routers/chat/_routes.py` → `_store_memory_bg` (regel 40) | Async wrapper, `try/except Exception: pass` patroon |
| Langfuse low-level tracing | `backend/routers/chat/_escalation.py` → `layer1_classify` (regel 253–277) | `propagate_attributes`, `start_as_current_observation`, `gen_span.update(output=raw)` |
| Frontend API-functie toevoegen | `frontend/Anna-remembers/lib/api.ts` → `getPatients()` (regel 113) | `get<T>(path)` helper gebruiken, aparte interface voor API-response, mapping-functie |
| Frontend patiënten ophalen | `frontend/Anna-remembers/lib/api.ts` → `getPatients()` (regel 113) | Al beschikbaar — niet opnieuw implementeren |

---

## Child Issue 1.1 — DB-schema + Alembic-migratie

**Bestanden:**
| Bestand | Actie |
|---|---|
| `backend/models/symptom_observation.py` | NIEUW — SQLAlchemy model |
| `backend/models/__init__.py` | AANPASSEN — `SymptomObservation` importeren + toevoegen aan `__all__` |
| `backend/alembic/versions/0009_add_symptom_observations.py` | AUTO-GENERATED via `alembic revision --autogenerate` — daarna handmatig index toevoegen |

**Patroon:** kopieer de modelstructuur van `backend/models/patient.py`. Gebruik `op.create_table()` uit `0001_initial_schema.py` als migratiereferentie.

**Taken:**
- [ ] `backend/models/symptom_observation.py` aanmaken:
  ```python
  class SymptomObservation(Base):
      __tablename__ = "symptom_observations"
      id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
      patient_id  = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
      session_id  = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
      week_number = Column(Integer, nullable=False)
      year        = Column(Integer, nullable=False)
      observed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
      dyspnea     = Column(Integer, CheckConstraint("dyspnea BETWEEN 0 AND 3"), nullable=True)
      edema       = Column(Integer, CheckConstraint("edema BETWEEN 0 AND 3"), nullable=True)
      fatigue     = Column(Integer, CheckConstraint("fatigue BETWEEN 0 AND 3"), nullable=True)
      medication  = Column(Integer, CheckConstraint("medication BETWEEN 0 AND 3"), nullable=True)
      weight_kg   = Column(Float, nullable=True)
      reasoning   = Column(JSONB, nullable=False, server_default="{}")
      extracted_by = Column(String, nullable=False, server_default="llm")
  ```
- [ ] `backend/models/__init__.py` — `SymptomObservation` toevoegen (anders pikt `autogenerate` de tabel niet op)
- [ ] `alembic revision --autogenerate -m "add symptom_observations"` draaien
- [ ] In de gegenereerde migratie handmatig index toevoegen:
  ```python
  op.create_index("idx_symptom_obs_patient_week",
                  "symptom_observations", ["patient_id", "year", "week_number"])
  # en in downgrade:
  op.drop_index("idx_symptom_obs_patient_week")
  ```
- [ ] `alembic upgrade head` testen op lege én bestaande database
- [ ] `alembic downgrade -1` testen

---

## Child Issue 1.2 — Pydantic-schema's

**Bestanden:**
| Bestand | Actie |
|---|---|
| `backend/schemas/symptom_observation.py` | NIEUW — alle request/response-schema's |

**Patroon:** zie `backend/schemas/patient.py` voor stijl en imports.

**Taken:**
- [ ] `backend/schemas/symptom_observation.py` aanmaken:
  ```python
  class SymptomObservationCreate(BaseModel):
      patient_id:  uuid.UUID
      session_id:  uuid.UUID
      week_number: int
      year:        int
      dyspnea:     Optional[int]   = None
      edema:       Optional[int]   = None
      fatigue:     Optional[int]   = None
      medication:  Optional[int]   = None
      weight_kg:   Optional[float] = None
      reasoning:   dict            = {}

      @field_validator("dyspnea", "edema", "fatigue", "medication", mode="before")
      @classmethod
      def must_be_0_to_3(cls, v):
          if v is not None and v not in (0, 1, 2, 3):
              raise ValueError("Score moet 0, 1, 2 of 3 zijn, of None")
          return v

  class SymptomObservationRead(SymptomObservationCreate):
      id:           uuid.UUID
      observed_at:  datetime
      extracted_by: str

  class TrendPoint(BaseModel):
      week:       str              # bijv. "2026-W23"
      dyspnea:    Optional[int]   = None
      edema:      Optional[int]   = None
      fatigue:    Optional[int]   = None
      medication: Optional[int]   = None
      weight_kg:  Optional[float] = None
      session_id: uuid.UUID

  class TrendsResponse(BaseModel):
      patient_id: uuid.UUID
      weeks:      int
      data:       list[TrendPoint]
  ```
- [ ] Unit tests voor validators: score `4` geweigerd, `weight_kg=79.5` accepted, `None` accepted

---

## Child Issue 2.1 — LLM-extractiefunctie

**Bestanden:**
| Bestand | Actie |
|---|---|
| `backend/services/symptom_extraction.py` | NIEUW — extractielogica + DB-opslag |
| `backend/services/llm.py` | GEBRUIK (niet aanpassen) — `get_llm_provider()` aanroepen |
| `backend/services/database.py` | GEBRUIK (niet aanpassen) — `SessionLocal` voor DB-schrijven |

**Taken:**
- [ ] `backend/services/symptom_extraction.py` aanmaken met `async def extract_and_store_symptoms(session_id, patient_id, transcript)`:
  - System prompt (zie Epic-beschrijving): schaal 0–3, null = niet besproken, weight_kg als float, reasoning per veld (max 80 tekens, NL), output: alleen JSON
  - LLM-aanroep via `get_llm_provider()` uit `services/llm.py`
  - `response_format={"type": "json_object"}` meegeven indien de provider het ondersteunt
  - Fallback JSON-extractie: `re.search(r'\{.*\}', raw, re.DOTALL)` als de response geen valide JSON is
  - Null-velden niet als 0 opslaan — alleen velden met een waarde (niet-None) in de `reasoning`-dict opnemen
  - ISO-week berekenen: `datetime.now(timezone.utc).isocalendar()` → `week_number`, `year`
  - DB-opslag via `SessionLocal()`:
    ```python
    db.merge(SymptomObservation(session_id=session_id, ...))  # UPSERT via merge
    db.commit()
    ```
- [ ] Handmatig testen met drie voorbeeldtranscripts: stabiel / verslechterend / urgent

---

## Child Issue 2.2 — Trigger + Langfuse tracing

**Bestanden:**
| Bestand | Actie |
|---|---|
| `backend/routers/chat/_routes.py` | AANPASSEN — BackgroundTask aanroep toevoegen na het opslaan van het AI-antwoord |
| `backend/services/symptom_extraction.py` | AANPASSEN — Langfuse tracing inbouwen |

**Patroon BackgroundTask:** zie `_store_memory_bg` in `_routes.py` (regel 40–51) — zelfde structuur: async wrapper, try/except, toegevoegd via `background_tasks.add_task(...)`.

**Patroon Langfuse:** zie `layer1_classify` in `_escalation.py` (regel 253–277) — gebruik exact dezelfde `propagate_attributes` + `start_as_current_observation` structuur. `get_langfuse()` is al geïmporteerd in dat bestand.

**Transcript samenstellen:** in `_routes.py` zijn de berichten van de sessie al beschikbaar in de variabele `history_rows` (de DB-query voor context). Combineer `history_rows` + het nieuwe gebruikersbericht + het nieuwe AI-antwoord tot een platte string:
```python
lines = [f"{m.role}: {m.content}" for m in history_rows]
lines.append(f"user: {user_message}")
lines.append(f"assistant: {ai_reply}")
full_transcript = "\n".join(lines)
```

**Taken:**
- [ ] `_routes.py` — na het opslaan van het AI-antwoord in DB:
  ```python
  background_tasks.add_task(
      extract_and_store_symptoms,
      session_id=str(session_id),
      patient_id=str(patient_id),
      transcript=full_transcript,
  )
  ```
- [ ] `symptom_extraction.py` — Langfuse tracing rondom de LLM-aanroep:
  ```python
  langfuse = get_langfuse()
  with propagate_attributes(user_id=str(patient_id), session_id=str(session_id),
                            trace_name="symptom-extraction"):
      with langfuse.start_as_current_observation(
          as_type="generation",
          name="symptom-extract-llm",
          model=model_name,
          input=transcript,
      ) as span:
          raw = await llm_call(...)
          span.update(output=raw)
  ```
- [ ] Gehele functie verpakken in `try/except Exception: logger.exception(...)` — nooit crash in chat-flow
- [ ] `UNIQUE (session_id)` constraint + `db.merge()` voorkomt dubbele extracties
- [ ] Verificatie in Langfuse dashboard: extractie zichtbaar als aparte generation

---

## Child Issue 2.3 — GET /trends endpoint

**Bestanden:**
| Bestand | Actie |
|---|---|
| `backend/routers/symptom_trends.py` | NIEUW — beide endpoints (2.3 + 2.4 in één bestand) |
| `backend/main.py` | AANPASSEN — `symptom_trends` importeren en `app.include_router(symptom_trends.router)` toevoegen (zie patroon in regels 4 en 19–24) |

**Taken:**
- [ ] `backend/routers/symptom_trends.py` aanmaken met `router = APIRouter(tags=["symptom-trends"])`:
  - Route: `GET /patients/{patient_id}/symptom-trends?weeks=8`
  - Cutoff berekenen: `(huidige jaar, huidige ISO-week) − weeks weken`
  - Query: `db.query(SymptomObservation).filter(...).order_by(year, week_number).all()`
  - Week-label: `f"{obs.year}-W{obs.week_number:02d}"`
  - Weken zonder observatie overslaan (geen lege datapunten invullen)
  - Response: `TrendsResponse` — `session_id` aanwezig per datapunt
  - Lege `data: []` retourneren als er geen observaties zijn (geen 404)
- [ ] `backend/main.py` regel 4 uitbreiden: `from routers import chat, escalations, patients, settings, tts, voice_samples, symptom_trends`
- [ ] `app.include_router(symptom_trends.router)` toevoegen na de bestaande routers

---

## Child Issue 2.4 — GET /observations detail endpoint

**Bestanden:**
| Bestand | Actie |
|---|---|
| `backend/routers/symptom_trends.py` | AANPASSEN — tweede route toevoegen in hetzelfde bestand |

**Taken:**
- [ ] Route toevoegen: `GET /patients/{patient_id}/symptom-observations/{session_id}`
- [ ] Query: `db.query(SymptomObservation).filter_by(patient_id=..., session_id=...).first()`
- [ ] `HTTPException(status_code=404)` als niet gevonden
- [ ] Response: `SymptomObservationRead` — `reasoning` bevat alleen niet-None velden

---

## Child Issue 3.1 — Recharts integratie + state fix

**Bestanden:**
| Bestand | Actie |
|---|---|
| `frontend/Anna-remembers/lib/api.ts` | AANPASSEN — `getTrends()` stub implementeren (regel 236) + `getSymptomObservation()` toevoegen |
| `frontend/Anna-remembers/types/index.ts` | AANPASSEN — `TrendPoint` vervangen (Dutch keys → API keys + `session_id`) |
| `frontend/Anna-remembers/components/trends/trends-screen.tsx` | AANPASSEN — mock vervangen door live API, state fix, patiënt-dropdown live, klikhandler |

**`weeks`-mapping:** de frontend range is `"7d" | "14d" | "28d"`. Stuur naar de backend als integer weken:
```ts
const weeksMap: Record<Range, number> = { "7d": 1, "14d": 2, "28d": 4 }
```

**Frontend API-patroon:** gebruik de bestaande `get<T>()` helper uit `lib/api.ts`. Voeg een interface toe voor de API-response en een mapping-functie — zie `getPatients()` (regel 113) als voorbeeld.

**Patiënt-dropdown:** `trends-screen.tsx` importeert nu `PATIENTS` mock. Vervang door `getPatients()` uit `lib/api.ts` — die functie bestaat al.

**Taken:**
- [ ] `frontend/Anna-remembers/types/index.ts` — `TrendPoint` vervangen:
  ```ts
  export interface TrendPoint {
    week:       string           // "2026-W23"
    dyspnea:    number | null
    edema:      number | null
    fatigue:    number | null
    medication: number | null
    weight_kg:  number | null
    session_id: string
  }
  export interface SymptomObservationRead {
    id:           string
    session_id:   string
    week_number:  number
    year:         number
    dyspnea:      number | null
    edema:        number | null
    fatigue:      number | null
    medication:   number | null
    weight_kg:    number | null
    reasoning:    Record<string, string>
    observed_at:  string
    extracted_by: string
  }
  ```
- [ ] `lib/api.ts` — `getTrends()` stub (regel 236) implementeren:
  ```ts
  export async function getTrends(patientId: string, weeks: number): Promise<TrendPoint[]> {
    const data = await get<{ data: TrendPoint[] }>(`/patients/${patientId}/symptom-trends?weeks=${weeks}`)
    return data.data
  }
  export async function getSymptomObservation(patientId: string, sessionId: string): Promise<SymptomObservationRead> {
    return get<SymptomObservationRead>(`/patients/${patientId}/symptom-observations/${sessionId}`)
  }
  ```
- [ ] `trends-screen.tsx` — state reset bij patiëntswitch:
  ```tsx
  useEffect(() => {
    setTrendData([])
    setLoading(true)
    getTrends(patientId, weeksMap[range])
      .then(setTrendData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [patientId, range])
  ```
- [ ] `PATIENTS` mock vervangen: `useEffect(() => { getPatients().then(setPatients) }, [])` + `useState<Patient[]>([])`
- [ ] `TRENDS` mock-import verwijderen uit `trends-screen.tsx`
- [ ] SYMPTOMS-array: keys aanpassen van `kortademigheid/oedeem/vermoeidheid/medicatietrouw/gewicht` naar `dyspnea/edema/fatigue/medication/weight_kg`
- [ ] Klikhandler op Recharts `dot` → `setModalSessionId(payload.session_id)`
- [ ] Loading state tonen (`isSkeleton` of spinner) — zie bestaande laadpatronen in `patients-screen.tsx`
- [ ] Lege toestand: `"Nog geen symptoomdata beschikbaar"` tonen als `trendData.length === 0 && !loading`

---

## Child Issue 3.2 — Clinical traceability modal

**Bestanden:**
| Bestand | Actie |
|---|---|
| `frontend/Anna-remembers/components/trends/symptom-detail-modal.tsx` | NIEUW — modal component |
| `frontend/Anna-remembers/components/trends/trends-screen.tsx` | AANPASSEN — modal importeren, `modalSessionId` state + open/close |

**Patroon modal:** gebruik het bestaande `Dialog` component uit `@/components/ui/dialog` (al aanwezig in het project). Zie `frontend/Anna-remembers/components/ui/dialog.tsx` voor de beschikbare sub-componenten: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`.

**Taken:**
- [ ] `symptom-detail-modal.tsx` aanmaken:
  - Props: `sessionId: string | null`, `patientId: string`, `onClose: () => void`
  - `useEffect` die `getSymptomObservation(patientId, sessionId)` aanroept als `sessionId` niet null is
  - Per symptoom met waarde: label + voortgangsbalk 0–3 (gebruik `<div style={{width: \`${(score/3)*100}%\`}} />`) + reasoning-tekst
  - Null-velden: label tonen met "(niet besproken)" in `text-muted-foreground`, geen balk
  - Gewicht: `{value} kg` tonen, geen 0–3 schaal
  - Wrapper: `<Dialog open={!!sessionId} onOpenChange={(open) => !open && onClose()}>`
- [ ] `trends-screen.tsx` — state + modal toevoegen:
  ```tsx
  const [modalSessionId, setModalSessionId] = useState<string | null>(null)
  // onderaan in de return:
  <SymptomDetailModal
    sessionId={modalSessionId}
    patientId={patientId}
    onClose={() => setModalSessionId(null)}
  />
  ```

---

## Definitie of Done (hele epic)

- [ ] Drie gesimuleerde patiënten hebben minstens 4 weken aan extracties
- [ ] Grafiek toont duidelijk een verslechterend patroon voor patiënt 2
- [ ] Klik op grafiekpunt toont de reasoning van Anna in een modal
- [ ] Langfuse toont extracties als aparte generations naast chatgeneraties
- [ ] Alle Alembic-migraties draaien foutloos op schone database
- [ ] `TRENDS` en `PATIENTS` mocks volledig verwijderd uit `trends-screen.tsx`
