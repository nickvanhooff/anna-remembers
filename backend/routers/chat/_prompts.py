"""Prompt builders for Anna's system prompt and medical summary."""

import json

from models.patient import Patient


def build_system_prompt(patient: Patient, memories: list[dict]) -> str:
    """Build Anna's 3-layer system prompt."""
    name = f"{patient.first_name} {patient.last_name}"
    medication = json.dumps(patient.medication_schedule, ensure_ascii=False)
    notes = patient.notes or "Geen aanvullende notities."

    # patient_stated facts only; noise threshold 0.08 (old questions sit around 0.045).
    useful = [
        m
        for m in memories
        if m.get("source") == "patient_stated" and (m.get("distance") or 0) > 0.08
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
        f"{_ANIM_INSTRUCTION}"
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


_ANIM_INSTRUCTION = (
    "BELANGRIJK — Animatie-tag (eerste regel van élke response):\n"
    "- Begin je antwoord ALTIJD met `[ANIM: x]` op een eigen regel, waarbij x exact één is van:\n"
    "  • standard_waiting\n"
    "  • stand_look_around\n"
    "  • running_fast\n"
    "  • standard_walk_crouching\n"
    "  • flexing_arm\n"
    "  • gorilla\n"
    "  • laying_on_floor\n"
    "  • just_chilling\n"
    "  • angry\n"
    "  • Expressing_joy\n"
    "  • model\n"
    "  • model (13)\n"
    "- De tag wordt automatisch verwijderd voordat de patiënt het ziet.\n\n"
)


def build_greet_prompt(patient: Patient, memories: list[dict]) -> str:
    """Build Anna's system prompt for the weekly check-in opening message."""
    name = patient.first_name
    medication = json.dumps(patient.medication_schedule, ensure_ascii=False)
    notes = patient.notes or "Geen aanvullende notities."

    useful = [
        m
        for m in memories
        if m.get("source") == "patient_stated" and (m.get("distance") or 0) > 0.08
    ]

    memory_block = ""
    if useful:
        lines = "\n".join(f"• {m['content']}" for m in useful)
        memory_block = (
            f"\n\nWat {name} eerder heeft verteld (gebruik dit voor een gerichte openingsvraag):\n{lines}"
        )

    summary_block = ""
    if patient.medical_summary:
        summary_block = f"\n\nMedische achtergrond:\n{patient.medical_summary}"

    return (
        f"Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
        f"Je spreekt met {name}.\n\n"
        f"{_ANIM_INSTRUCTION}"
        f"Het is tijd voor de wekelijkse check-in met {name}. "
        f"Stuur het openingsbericht van dit gesprek.\n\n"
        f"Regels voor het openingsbericht:\n"
        f"- Begroet {name} vriendelijk bij naam.\n"
        f"- Stel precies één open, indirecte vraag over hoe het die week is gegaan — "
        f"vraag niet rechtstreeks naar symptomen of medicatie. "
        f"Vraag bijvoorbeeld hoe {name} zich voelt, hoe de afgelopen week was, "
        f"of er iets opviel deze week.\n"
        f"- Als er eerdere informatie beschikbaar is, verwijs er dan subtiel naar "
        f"(bv. 'De vorige keer vertelde je dat je wat kortademig was — hoe gaat dat nu?').\n"
        f"- Sluit af met een korte zin die duidelijk maakt wat {name} kan delen "
        f"(klachten, hoe de week was, medicatie, gewicht — wat dan ook).\n"
        f"- Houd het kort: maximaal 3 zinnen.\n"
        f"- Toon: warm en uitnodigend.\n\n"
        f"Patiëntgegevens:\n"
        f"- Naam: {name}\n"
        f"- Medicatieschema: {medication}\n"
        f"- Notities zorgverlener: {notes}"
        f"{summary_block}"
        f"{memory_block}"
    )


def build_summary_prompt(
    patient_name: str, current_summary: str | None, messages: list[dict]
) -> str:
    """Build the prompt that generates or updates the medical summary."""
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
        f"- Add to sym: ANY physical complaint the patient mentions — pain, fever, shortness of breath, "
        f"swelling, dizziness, palpitations, chills, chest pressure, nausea. When in doubt, include it.\n"
        f"- Add to ovr: contact details the patient shares (phone numbers, addresses, emergency contacts).\n"
        f"- Ignore questions, jokes, and purely emotional statements with no factual content.\n"
        f"- Preserve existing facts. Add new ones. Remove only if the patient explicitly contradicts them.\n"
        f"- No duplicates. Max 6 words per entry. Dutch."
    )
