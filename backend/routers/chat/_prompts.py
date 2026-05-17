"""Prompt builders voor Anna's system prompt en medische samenvatting."""

import json

from models.patient import Patient


def build_system_prompt(patient: Patient, memories: list[dict]) -> str:
    """Bouw de 3-laags system prompt voor Anna."""
    name = f"{patient.first_name} {patient.last_name}"
    medication = json.dumps(patient.medication_schedule, ensure_ascii=False)
    notes = patient.notes or "Geen aanvullende notities."

    # Alleen patient_stated feiten; noise-drempel op 0.08 (oude vragen liggen rond 0.045).
    useful = [
        m for m in memories
        if m.get("source") == "patient_stated"
        and (m.get("distance") or 0) > 0.08
    ]

    memory_block = ""
    if useful:
        lines = "\n".join(f"• {m['content']}" for m in useful)
        memory_block = (
            f"\n\nPATIËNTENDOSSIER (opgebouwd uit eerdere gesprekken — altijd beschikbaar):\n{lines}\n"
            f"Gebruik bovenstaande dossiergegevens direct als antwoord wanneer de patiënt ernaar vraagt. "
            f"Dit is geautoriseerde medische informatie die je altijd beschikbaar hebt."
        )

    summary_block = ""
    if patient.medical_summary:
        summary_block = (
            f"\n\nMEDISCHE SAMENVATTING (automatisch bijgehouden over alle gesprekken):\n"
            f"{patient.medical_summary}\n"
            f"Gebruik deze samenvatting als achtergrondinformatie. Refereer er subtiel aan "
            f"wanneer de patiënt over eerder besproken onderwerpen begint."
        )

    return (
        f"Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
        f"Je spreekt met {name}.\n\n"
        f"Gedragsregels:\n"
        f"- Verzin nooit symptomen, medicatie of gewicht die de patiënt niet heeft gemeld.\n"
        f"- Stel maximaal één gerichte vervolgvraag per response.\n"
        f"- Spreek altijd Nederlands.\n"
        f"- Toon: rustig, professioneel en respectvol. Geen schreeuwende tekst (geen hele zinnen in "
        f"HOOFDLETTERS), geen overdreven waarschuwingen of 'poster'-achtige opmaak met emoji's.\n"
        f"- Je bent geen meldkamer en geen vervanger van huisartsenpost of 112. Geef geen "
        f"stap-voor-stap noodscripts en noem geen alarmnummers (zoals 112), tenzij de patiënt daar "
        f"expliciet zelf om vraagt.\n"
        f"- Je kunt geen telefoongesprekken voeren. Leg dat zo nodig kort en neutraal uit.\n"
        f"- Als de patiënt een telefoonnummer deelt: noteer het kort. Gebruik het niet voor "
        f"dramatische belplannen.\n"
        f"- Reageer proportioneel op het huidige bericht, niet op het patroon van eerdere berichten.\n\n"
        f"Patiëntgegevens:\n"
        f"- Naam: {name}\n"
        f"- Medicatieschema: {medication}\n"
        f"- Notities zorgverlener: {notes}"
        f"{summary_block}"
        f"{memory_block}"
    )


def build_summary_prompt(patient_name: str, current_summary: str | None, messages: list[dict]) -> str:
    """Bouw de prompt die de medische samenvatting genereert of bijwerkt."""
    lines = "\n".join(f"[{m['role'].upper()}] {m['content']}" for m in messages)
    current = current_summary or '{"sym":[],"med":null,"wgt":null,"bhv":null,"ovr":[]}'
    return (
        f"You are updating a medical dossier for patient {patient_name}.\n\n"
        f"Current dossier (JSON):\n{current}\n\n"
        f"Conversation ([USER] = patient, [ASSISTANT] = AI):\n{lines}\n\n"
        f"Return the updated dossier as a single JSON object. "
        f"Output ONLY the JSON — no explanation, no preamble, no markdown.\n"
        f"Schema: "
        f'{{"sym":[],"med":null,"wgt":null,"bhv":null,"ovr":[]}}\n'
        f"Rules:\n"
        f"- Only use facts from [USER] lines. [ASSISTANT] lines are not facts.\n"
        f"- Only include MEDICALLY RELEVANT facts (symptoms, weight, medication, health behaviour).\n"
        f"- Ignore questions, jokes, addresses, phone numbers, and non-medical statements.\n"
        f"- Preserve existing facts. Add new ones. Remove only if the patient contradicts them.\n"
        f"- No duplicates. Max 6 words per entry. Dutch."
    )
