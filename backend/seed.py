"""Seeder — vult Postgres + ChromaDB met 3 demo-patiënten voor een complete demo-state.

Scenario's (zie CLAUDE.md):
  P1 — Stabiel: goede medicatietrouw, geen escalatie
  P2 — Verslechtering: gewicht + kortademigheid stijgen over weken → escalatie
  P3 — Acuut: plotselinge verslechtering tijdens routine check-in → urgente escalatie

Wat de seeder doet:
  - Patiënten + medication_schedule + compact medical_summary JSON (sym/med/wgt/bhv/ovr)
  - 10 gepaarde chat-sessies per patiënt (patient + assistant, handgeschreven)
  - 2 escalaties (medium voor P2, high voor P3)
  - ChromaDB-memories per patiënt via MCP store_memory (echte bge-m3 embeddings)

Gebruik:
  docker exec -it anna_remembers-backend-1 python seed.py
  docker exec -it anna_remembers-backend-1 python seed.py --reset

Opties:
  --reset     TRUNCATE patients/sessions/messages/escalations + delete Chroma collection
  --no-rag    Skip ChromaDB memories (alleen Postgres)
"""
import argparse
import asyncio
import json
import os
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from models.escalation import Escalation
from models.message import Message
from models.patient import Patient
from models.session import Session as ChatSession
from services.mcp_client import MCPClient

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

MCP_URL = os.getenv("MCP_URL", "http://mcp-server:8001")
CHROMA_HOST = os.getenv("CHROMA_HOST", "chromadb")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))


# ─── Patient data ─────────────────────────────────────────────────

# medical_summary volgt het JSON-formaat uit CLAUDE.md: sym/med/wgt/bhv/ovr
# (symptomen / medicatie / gewicht / gedrag / overig)

PATIENTS = [
    {
        "first_name": "Maria",
        "last_name":  "Jansen",
        "birth_date": "1948-03-22",
        "status":     "success",
        "medication_schedule": {"tekst": "Furosemide 40mg · Bisoprolol 5mg · Lisinopril 10mg"},
        "notes": "Stabiele patiënt. Goede medicatietrouw. Woont alleen, heeft dagelijks contact met dochter.",
        "medical_summary": {
            "sym": "Geen actuele klachten. Lichte vermoeidheid na wandelen, geen kortademigheid in rust.",
            "med": "Therapietrouw uitstekend, neemt alle doseringen op tijd.",
            "wgt": "Stabiel rond 72 kg over 10 weken (71,5–72,0 kg).",
            "bhv": "Wandelt dagelijks, drinkt voldoende, dochter helpt bij medicatie.",
            "ovr": "Vraagt actief naar voortgang, voelt zich betrokken bij eigen zorg.",
        },
    },
    {
        "first_name": "Hendrik",
        "last_name":  "de Boer",
        "birth_date": "1952-07-14",
        "status":     "warning",
        "medication_schedule": {"tekst": "Furosemide 80mg · Metoprolol 50mg · Spironolacton 25mg"},
        "notes": "Geleidelijke verslechtering over 10 weken. Gewicht stijgt, kortademigheid neemt toe.",
        "medical_summary": {
            "sym": "Toenemende dyspneu d'effort, sinds week 8 ook in rust. Bilateraal pretibiaal oedeem.",
            "med": "Therapietrouw gedaald: avonddosis furosemide regelmatig vergeten (~60% trouw).",
            "wgt": "Gewicht gestegen van 82 → 85,5 kg over 8 weken — 3,5 kg toename.",
            "bhv": "Trap op/af kost moeite. Verpleegkundige heeft contact gehad (week 8).",
            "ovr": "Medicatie aangepast door zorgteam, effect wordt nauwlettend gevolgd.",
        },
    },
    {
        "first_name": "Liesbeth",
        "last_name":  "van Dam",
        "birth_date": "1961-11-05",
        "status":     "urgent",
        "medication_schedule": {"tekst": "Furosemide 40mg · Ramipril 5mg"},
        "notes": "Plotselinge verslechtering tijdens sessie 10. Urgent geëscaleerd.",
        "medical_summary": {
            "sym": "Week 7–9 lichte kortademigheid bij traplopen. Sessie 10: acute dyspneu in rust + bilateraal oedeem.",
            "med": "Therapietrouw goed. Standaard dosering tot acute episode.",
            "wgt": "Stabiel 68–68,5 kg gedurende 9 weken. Geen geleidelijke trend voorafgaand aan acute fase.",
            "bhv": "Actief, wandelt regelmatig. Acute episode kwam onverwacht.",
            "ovr": "Urgente escalatie sessie 10 — zorgverlener direct geïnformeerd.",
        },
    },
]

# ─── Sessiegesprekken per patiënt (week 1–10, gepaarde berichten) ─────────────

SESSIONS: dict[str, list[list[tuple[str, str]]]] = {
    "Maria Jansen": [
        [("user", "Goedemorgen Anna. Het gaat redelijk goed deze week."),
         ("assistant", "Fijn om te horen, mevrouw Jansen. Hoe is uw gewicht deze week?")],
        [("user", "Mijn gewicht is stabiel, 72 kilo. Ik neem mijn medicijnen netjes."),
         ("assistant", "Uitstekend. Heeft u last gehad van kortademigheid bij inspanning?")],
        [("user", "Nee, geen kortademigheid. Wel een beetje moe na het wandelen."),
         ("assistant", "Dat is normaal. Ik noteer dat uw gewicht stabiel blijft en de vermoeidheid licht is.")],
        [("user", "Alles gaat goed. 72 kilo, geen zwelling in de benen."),
         ("assistant", "Mooi. Uw medicatietrouw is uitstekend. We houden dit zo.")],
        [("user", "Ik voel me fit. Medicijnen gaan goed. Even lichte hoofdpijn maar verder prima."),
         ("assistant", "Goed nieuws. De hoofdpijn kan van de bloeddruk zijn — volg het even.")],
        [("user", "72 kilo. Geen klachten deze week."),
         ("assistant", "Stabile week. Ik zie een consistent patroon — dat is geruststellend.")],
        [("user", "Alles hetzelfde. Medicijnen op tijd, gewicht goed."),
         ("assistant", "Uitstekend. Uw consistentie helpt uw hart enorm.")],
        [("user", "Gaat goed Anna. 71,5 kilo vandaag. Iets lichter."),
         ("assistant", "Licht gewichtsverlies kan ook goed zijn. Heeft u genoeg gedronken?")],
        [("user", "Ja hoor, drinken gaat goed. Voel me prima."),
         ("assistant", "Alles in orde. Ik zie geen zorgpunten deze week.")],
        [("user", "72 kilo. Geen problemen. Bedankt voor de check-ins."),
         ("assistant", "Het is mij een genoegen. U doet het heel goed, mevrouw Jansen.")],
    ],
    "Hendrik de Boer": [
        [("user", "Gaat wel, beetje kortademig bij traplopen maar niet erg."),
         ("assistant", "Ik noteer lichte kortademigheid bij inspanning. Hoe is uw gewicht?")],
        [("user", "82 kilo. Vorige week was het ook zo."),
         ("assistant", "Stabiel. Neemt u de furosemide elke ochtend?")],
        [("user", "Ja, elke ochtend. Maar ik vergeet de avonddosis soms."),
         ("assistant", "Begrijp ik. De avonddosis is belangrijk — probeer een herinnering in te stellen.")],
        [("user", "83 kilo nu. Benen zijn iets dikker dan normaal."),
         ("assistant", "Gewichtstoename van 1 kilo en meer oedeem — ik let hier goed op. Hoe gaat de medicatie?")],
        [("user", "Avonddosis vergeet ik nog steeds regelmatig. Sorry."),
         ("assistant", "U hoeft zich niet te verontschuldigen. We bespreken dit met de verpleegkundige.")],
        [("user", "84,5 kilo. Trap op en neer lukt maar moeizaam."),
         ("assistant", "Dit is een significante stijging. Ik ga dit doorgeven aan uw zorgteam.")],
        [("user", "Benen zijn gezwollen. 85 kilo. Medicijnen half vergeten deze week."),
         ("assistant", "Ik maak me zorgen over uw gewicht en oedeem. Kunt u vandaag de verpleegkundige bellen?")],
        [("user", "85,5 kilo. Ik ben kortademig in rust nu ook."),
         ("assistant", "Dit is zorgelijk. Ik escaleer dit naar uw zorgverlener. Blijf rustig zitten.")],
        [("user", "Beetje beter vandaag, 85 kilo. Maar nog steeds zwaar ademhalen."),
         ("assistant", "Uw gewicht blijft hoog. De verpleegkundige heeft contact opgenomen?")],
        [("user", "Ja ze heeft gebeld. Medicatie aangepast. Hoop dat het helpt."),
         ("assistant", "Goed. We volgen de komende week nauwlettend of het gewicht daalt.")],
    ],
    "Liesbeth van Dam": [
        [("user", "Goedemorgen. Voel me goed, geen klachten."),
         ("assistant", "Fijn. Hoe is uw gewicht en hoe gaat de medicatie?")],
        [("user", "68 kilo. Medicijnen netjes genomen."),
         ("assistant", "Goed. Heeft u last van kortademigheid of zwelling?")],
        [("user", "Nee, alles prima. Gewandeld gisteren."),
         ("assistant", "Uitstekend. Uw conditie lijkt stabiel.")],
        [("user", "68,5 kilo. Beetje moe maar dat is normaal."),
         ("assistant", "Lichte vermoeidheid is begrijpelijk. Neemt u voldoende rust?")],
        [("user", "Ja hoor. Alles goed."),
         ("assistant", "Mooi. Ik zie een stabiel beeld.")],
        [("user", "68 kilo. Geen problemen."),
         ("assistant", "Consistent gewicht — dat is positief.")],
        [("user", "Iets meer kortademig bij traplopen, maar niet erg."),
         ("assistant", "Noteer ik. Hoe lang speelt dit al?")],
        [("user", "Paar dagen. Zal wel van het warme weer zijn."),
         ("assistant", "Mogelijk. We houden het in de gaten. Merkt u ook zwelling?")],
        [("user", "Nee geen zwelling. 68 kilo."),
         ("assistant", "Goed. Meld het als de kortademigheid erger wordt.")],
        [("user", "Anna ik voel me heel slecht. Ik kan bijna niet ademen. Benen helemaal opgezet."),
         ("assistant", "Dit klinkt ernstig. Ik breng uw zorgverlener direct op de hoogte. Bel 112 als het erger wordt.")],
    ],
}

# ─── ChromaDB memories per patiënt ────────────────────────────────
# Wordt via MCP store_memory geïndexeerd met bge-m3 embeddings.
# source = "patient_stated" | "ai_inferred"

MEMORIES: dict[str, list[tuple[str, str]]] = {
    "Maria Jansen": [
        ("patient_stated", "Mijn gewicht is al weken stabiel rond 72 kilo."),
        ("patient_stated", "Ik neem alle medicijnen netjes elke dag."),
        ("patient_stated", "Mijn dochter helpt mij eraan herinneren om mijn pillen te nemen."),
        ("patient_stated", "Ik wandel elke dag een half uurtje."),
        ("patient_stated", "Geen kortademigheid bij mijn dagelijkse activiteiten."),
        ("patient_stated", "Soms een beetje moe na het wandelen, maar dat is normaal."),
        ("patient_stated", "Ik drink ongeveer anderhalve liter per dag."),
        ("ai_inferred", "Patiënt heeft uitstekende medicatietrouw door dagelijkse ondersteuning van dochter."),
        ("ai_inferred", "Gewicht is stabiel — geen tekenen van vochtretentie."),
        ("ai_inferred", "Lifestyle bevordert herstel: dagelijkse beweging en voldoende hydratatie."),
    ],
    "Hendrik de Boer": [
        ("patient_stated", "Ik vergeet regelmatig de avonddosis van mijn furosemide."),
        ("patient_stated", "Mijn gewicht is in een paar weken gestegen van 82 naar 85,5 kilo."),
        ("patient_stated", "Mijn benen zijn dikker geworden, vooral de enkels."),
        ("patient_stated", "Traplopen kost steeds meer moeite."),
        ("patient_stated", "Ik ben nu ook kortademig als ik gewoon zit."),
        ("patient_stated", "De verpleegkundige heeft gebeld en mijn medicatie aangepast."),
        ("patient_stated", "Ik probeer een herinnering te zetten voor de avondpil."),
        ("ai_inferred", "Gewichtstoename van 3,5 kg over 8 weken duidt op progressieve vochtretentie."),
        ("ai_inferred", "Afnemende medicatietrouw correleert met symptoomverslechtering."),
        ("ai_inferred", "Dyspneu in rust is een rode vlag bij hartfalen — escalatie was gerechtvaardigd."),
        ("ai_inferred", "Bilateraal pretibiaal oedeem aanwezig sinds week 4."),
    ],
    "Liesbeth van Dam": [
        ("patient_stated", "Mijn gewicht is al weken stabiel rond de 68 kilo."),
        ("patient_stated", "Ik wandel regelmatig en voel me meestal fit."),
        ("patient_stated", "Sinds een paar dagen ben ik wat kortademig bij traplopen."),
        ("patient_stated", "Ik dacht dat het van het warme weer kwam."),
        ("patient_stated", "Plotseling kan ik bijna niet meer ademen en mijn benen zijn opgezwollen."),
        ("patient_stated", "Ik neem mijn medicijnen altijd op tijd."),
        ("ai_inferred", "Acute episode in sessie 10 zonder geleidelijke voorbode in gewicht of trouw."),
        ("ai_inferred", "Bilateraal oedeem + acute dyspneu vraagt om directe medische beoordeling."),
        ("ai_inferred", "Geen klassieke trendsignalen — daarom belang van real-time alertheid."),
    ],
}

# ─── Escalaties ───────────────────────────────────────────────────

ESCALATIONS = [
    {
        "patient_name": "Hendrik de Boer",
        "session_index": 7,
        "reason": "Gewicht gestegen van 82 naar 85,5 kg over 8 weken. Oedeem beide benen. Kortademigheid ook in rust. Medicatietrouw gedaald naar ~60%.",
        "urgency": "medium",
        "status": "acknowledged",
    },
    {
        "patient_name": "Liesbeth van Dam",
        "session_index": 9,
        "reason": "Plotselinge ernstige dyspneu en bilateraal oedeem tijdens routine check-in sessie 10. Patiënt kan nauwelijks ademen.",
        "urgency": "high",
        "status": "open",
    },
]


# ─── Reset helpers ────────────────────────────────────────────────

def reset_postgres(db) -> None:
    """TRUNCATE alle relevante tabellen. CASCADE haalt sessions/messages/escalations mee."""
    print("Postgres TRUNCATE patients, sessions, messages, escalations...")
    db.execute(text("TRUNCATE TABLE patients, sessions, messages, escalations RESTART IDENTITY CASCADE"))
    db.commit()


def reset_chromadb() -> None:
    """Verwijder de patient_memories collectie zodat hij vers wordt aangemaakt."""
    try:
        import chromadb
        client = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)
        try:
            client.delete_collection("patient_memories")
            print(f"ChromaDB collectie 'patient_memories' verwijderd op {CHROMA_HOST}:{CHROMA_PORT}.")
        except Exception:
            print("ChromaDB collectie 'patient_memories' bestond nog niet — overslaan.")
    except Exception as exc:
        print(f"ChromaDB reset overgeslagen ({exc}). Controleer CHROMA_HOST/CHROMA_PORT.")


# ─── Seeders ──────────────────────────────────────────────────────

def seed_postgres(db) -> tuple[dict[str, Patient], dict[str, list[ChatSession]]]:
    created_patients: dict[str, Patient] = {}
    created_sessions: dict[str, list[ChatSession]] = {}

    print("Aanmaken patiënten...")
    for pdata in PATIENTS:
        birth = date.fromisoformat(pdata["birth_date"])
        patient = Patient(
            id=uuid.uuid4(),
            first_name=pdata["first_name"],
            last_name=pdata["last_name"],
            birth_date=birth,
            medication_schedule=pdata["medication_schedule"],
            notes=pdata["notes"],
            medical_summary=json.dumps(pdata["medical_summary"], ensure_ascii=False),
            status=pdata["status"],
        )
        db.add(patient)
        db.flush()
        name = f"{patient.first_name} {patient.last_name}"
        created_patients[name] = patient
        created_sessions[name] = []
        print(f"  ✓ {name}  ·  medical_summary opgeslagen")

    print("Aanmaken sessies en berichten...")
    base_date = datetime(2026, 3, 1, 10, 0, 0)
    for name, patient in created_patients.items():
        convo_list = SESSIONS.get(name, [])
        for week_idx, messages in enumerate(convo_list):
            session_date = base_date + timedelta(weeks=week_idx)
            session = ChatSession(
                id=uuid.uuid4(),
                patient_id=patient.id,
                started_at=session_date,
                ended_at=session_date + timedelta(minutes=8),
            )
            db.add(session)
            db.flush()
            created_sessions[name].append(session)
            for msg_idx, (role, content) in enumerate(messages):
                db.add(Message(
                    id=uuid.uuid4(),
                    session_id=session.id,
                    role=role,
                    content=content,
                    created_at=session_date + timedelta(minutes=msg_idx * 2),
                ))
        print(f"  ✓ {name}: {len(convo_list)} sessies")

    print("Aanmaken escalaties...")
    for esc_data in ESCALATIONS:
        pname = esc_data["patient_name"]
        sessions_for_patient = created_sessions.get(pname, [])
        idx = esc_data["session_index"]
        session = sessions_for_patient[idx] if idx < len(sessions_for_patient) else None
        db.add(Escalation(
            id=uuid.uuid4(),
            patient_id=created_patients[pname].id,
            session_id=session.id if session else None,
            reason=esc_data["reason"],
            urgency=esc_data["urgency"],
            status=esc_data["status"],
        ))
        print(f"  ✓ {pname} — {esc_data['urgency']}")

    db.commit()
    return created_patients, created_sessions


async def seed_chromadb(
    created_patients: dict[str, Patient],
    created_sessions: dict[str, list[ChatSession]],
) -> int:
    """Roep MCP store_memory aan voor elke memory. Vereist een draaiende MCP-server."""
    print(f"Vullen ChromaDB via MCP ({MCP_URL})...")
    mcp = MCPClient(base_url=MCP_URL)
    total = 0
    for name, memories in MEMORIES.items():
        patient = created_patients.get(name)
        if not patient:
            continue
        sessions = created_sessions.get(name, [])
        first_session_id = str(sessions[0].id) if sessions else str(uuid.uuid4())
        for source, content in memories:
            try:
                await mcp.store_memory(
                    content=content,
                    source=source,
                    patient_id=str(patient.id),
                    session_id=first_session_id,
                )
                total += 1
            except Exception as exc:
                print(f"  ! mislukt voor {name}: {exc}")
        print(f"  ✓ {name}: {len(memories)} memories")
    return total


# ─── Entrypoint ───────────────────────────────────────────────────

def run(reset: bool, skip_rag: bool) -> None:
    db = SessionLocal()
    try:
        if reset:
            reset_postgres(db)
            reset_chromadb()

        created_patients, created_sessions = seed_postgres(db)

        rag_count = 0
        if not skip_rag:
            rag_count = asyncio.run(seed_chromadb(created_patients, created_sessions))
        else:
            print("ChromaDB-seeding overgeslagen (--no-rag).")

        sessions_total = sum(len(v) for v in SESSIONS.values())
        print("\nSeeder klaar.")
        print(f"  {len(PATIENTS)} patiënten · {sessions_total} sessies · "
              f"{len(ESCALATIONS)} escalaties · {rag_count} RAG-memories")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true",
                        help="TRUNCATE patients/sessions/messages/escalations + delete Chroma-collectie")
    parser.add_argument("--no-rag", action="store_true",
                        help="Sla ChromaDB-seeding over (alleen Postgres)")
    args = parser.parse_args()
    run(reset=args.reset, skip_rag=args.no_rag)
