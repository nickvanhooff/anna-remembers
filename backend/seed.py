"""Seeder — vult de database met 3 gesimuleerde patiënten × 10 sessies.

Scenario's (zie CLAUDE.md):
  P1 — Stabiel: goede medicatietrouw, geen escalatie
  P2 — Verslechtering: gewicht + kortademigheid stijgen over weken → escalatie
  P3 — Acuut: plotselinge verslechtering tijdens routine check-in → urgente escalatie

Gebruik:
  docker exec -it anna_remembers-backend-1 python seed.py
  python seed.py  (buiten Docker, DATABASE_URL als env var)

Opties:
  python seed.py --reset   wist bestaande seeder-data en vult opnieuw
"""
import argparse
import os
import uuid
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.base import Base
from models.escalation import Escalation
from models.message import Message
from models.patient import Patient
from models.session import Session as ChatSession

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# ─── Seed data ────────────────────────────────────────────────────

PATIENTS = [
    {
        "first_name": "Maria",
        "last_name":  "Jansen",
        "birth_date": "1948-03-22",
        "status":     "success",
        "medication_schedule": {"tekst": "Furosemide 40mg · Bisoprolol 5mg · Lisinopril 10mg"},
        "notes": "Stabiele patiënt. Goede medicatietrouw. Woont alleen, heeft dagelijks contact met dochter.",
    },
    {
        "first_name": "Hendrik",
        "last_name":  "de Boer",
        "birth_date": "1952-07-14",
        "status":     "warning",
        "medication_schedule": {"tekst": "Furosemide 80mg · Metoprolol 50mg · Spironolacton 25mg"},
        "notes": "Geleidelijke verslechtering over 10 weken. Gewicht stijgt, kortademigheid neemt toe.",
    },
    {
        "first_name": "Liesbeth",
        "last_name":  "van Dam",
        "birth_date": "1961-11-05",
        "status":     "urgent",
        "medication_schedule": {"tekst": "Furosemide 40mg · Ramipril 5mg"},
        "notes": "Plotselinge verslechtering tijdens sessie 10. Urgent geëscaleerd.",
    },
]

# Sessiegesprekken per patiënt (week 1–10, 2 berichten per sessie)
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

ESCALATIONS = [
    {
        "patient_name": "Hendrik de Boer",
        "session_index": 7,  # sessie 8 (0-indexed)
        "reason": "Gewicht gestegen van 82 naar 85,5 kg over 8 weken. Oedeem beide benen. Kortademigheid ook in rust. Medicatietrouw gedaald naar ~60%.",
        "urgency": "medium",
        "status": "acknowledged",
    },
    {
        "patient_name": "Liesbeth van Dam",
        "session_index": 9,  # sessie 10 (0-indexed)
        "reason": "Plotselinge ernstige dyspneu en bilateraal oedeem tijdens routine check-in sessie 10. Patiënt kan nauwelijks ademen.",
        "urgency": "high",
        "status": "open",
    },
]


# ─── Seeder ───────────────────────────────────────────────────────

def run(reset: bool = False) -> None:
    db = SessionLocal()

    if reset:
        print("Resetting seeder data...")
        seeded_names = [f"{p['first_name']} {p['last_name']}" for p in PATIENTS]
        existing = db.query(Patient).filter(
            Patient.first_name.in_([p["first_name"] for p in PATIENTS])
        ).all()
        for p in existing:
            db.delete(p)
        db.commit()
        print(f"  Verwijderd: {len(existing)} patiënten")

    created_patients: dict[str, Patient] = {}
    created_sessions: dict[str, list[ChatSession]] = {}

    print("Aanmaken patiënten...")
    for i, pdata in enumerate(PATIENTS):
        from datetime import date
        birth = date.fromisoformat(pdata["birth_date"])
        patient = Patient(
            id=uuid.uuid4(),
            first_name=pdata["first_name"],
            last_name=pdata["last_name"],
            birth_date=birth,
            medication_schedule=pdata["medication_schedule"],
            notes=pdata["notes"],
            status=pdata["status"],
        )
        db.add(patient)
        db.flush()
        name = f"{patient.first_name} {patient.last_name}"
        created_patients[name] = patient
        created_sessions[name] = []
        print(f"  ✓ {name}")

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
                msg = Message(
                    id=uuid.uuid4(),
                    session_id=session.id,
                    role=role,
                    content=content,
                    created_at=session_date + timedelta(minutes=msg_idx * 2),
                )
                db.add(msg)

        print(f"  ✓ {name}: {len(convo_list)} sessies")

    print("Aanmaken escalaties...")
    for esc_data in ESCALATIONS:
        pname = esc_data["patient_name"]
        sessions_for_patient = created_sessions.get(pname, [])
        idx = esc_data["session_index"]
        session = sessions_for_patient[idx] if idx < len(sessions_for_patient) else None

        escalation = Escalation(
            id=uuid.uuid4(),
            patient_id=created_patients[pname].id,
            session_id=session.id if session else None,
            reason=esc_data["reason"],
            urgency=esc_data["urgency"],
            status=esc_data["status"],
        )
        db.add(escalation)
        print(f"  ✓ {pname} — {esc_data['urgency']}")

    db.commit()
    db.close()
    print("\nSeeder klaar.")
    print(f"  {len(PATIENTS)} patiënten · {sum(len(v) for v in SESSIONS.values())} sessies · {len(ESCALATIONS)} escalaties")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Wis bestaande seeder-data voor opnieuw vullen")
    args = parser.parse_args()
    run(reset=args.reset)
