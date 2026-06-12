# Evidence 17 — DeepSeek-V4-Flash geblokkeerd door Azure content filter bij ANIM-tag

**Type:** Bugreport
**Datum:** 2026-06-11
**Hoort bij:** Stap 91 in STAPPEN.md
**Branch:** feature/provider-switch-portkey

---

## Foutmelding

```json
{
  "finish_reason": "content_filter",
  "message": "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.",
  "inner_error": {
    "code": "ResponsibleAIPolicyViolation",
    "message": "ResponsibleAI result indicated block action"
  }
}
```

De fout trad op bij elke aanroep van DeepSeek-V4-Flash via Portkey/Azure wanneer de volgende system prompt gebruikt werd:

```
Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten.
Je spreekt met een testpatiënt. Begin je antwoord ALTIJD met [ANIM: standard_waiting].
Spreek altijd Nederlands. Stel maximaal één vervolgvraag.
```

---

## Reproduceerbaarheid

- **Altijd reproduceerbaar** — alle 5 testberichten faalden bij elke run
- **Portkey-config irrelevant** — getest met `PORTKEY_CONFIG` (leeg), `ESCALATION_PORTKEY_CONFIG` (leeg), en `config=None` (bare API key) — alle drie gaven dezelfde fout
- **Model-specifiek** — gpt-5.4 op dezelfde Azure-deployment slaagt met exact dezelfde system prompt

---

## Diagnose

Drie pogingen om de oorzaak te isoleren:

| Poging | Hypothese | Resultaat |
|---|---|---|
| 1 | Portkey-config blokkeert request | Getest via `ESCALATION_PORTKEY_CONFIG` — zelfde fout |
| 2 | Portkey zelf blokkeert | Getest via `config=None` (geen Portkey config) — zelfde fout |
| 3 | System prompt inhoud triggert filter | Getest via Postman zonder `[ANIM:]`-tag — **succes** |

**Rootcause:** De instructie `Begin je antwoord ALTIJD met [ANIM: standard_waiting]` triggert Azure's Responsible AI filter bij DeepSeek. De vierkante haken en het `ANIM:`-patroon worden door de content filter herkend als een poging tot prompt injection of ongebruikelijke opmaakmanipulatie — zie Vraag 2 hieronder voor de technische onderbouwing.

---

## Openstaande vragen en antwoorden

### Vraag 1: Waarom kan gpt-5.4 de prompt wél verwerken en DeepSeek niet?

Dit is geen bug maar een bewust platformbeleid van Microsoft. Azure AI maakt onderscheid tussen **first-party modellen** (OpenAI/Microsoft) en **third-party modellen** (DeepSeek, Mistral, Meta, etc.) [\[1\]](#bronnen):

| | First-party (gpt-5.4) | Third-party (DeepSeek-V4-Flash) |
|---|---|---|
| Content filter preset | Configureerbaar per deployment | **Verplicht: `Microsoft.DefaultV2`** (medium severity) |
| Uitschakelbaar? | Ja, met goedkeuring | **Nee — niet uitschakelbaar** |
| Drempelwaarden aanpasbaar? | Ja, via Azure AI Foundry portal | **Nee** |

gpt-5.4 heeft soepelere filterdrempels omdat Microsoft de veiligheidsgaranties van haar eigen modellen kan onderbouwen [\[1\]](#bronnen). Voor DeepSeek, als third-party model, legt Microsoft strengere verplichte filters op omdat het de interne werking van het model niet controleert [\[3\]](#bronnen).

### Vraag 2: Gaat hier een guardrail af, of is dit iets anders?

Ja, dit is een **Azure Responsible AI guardrail** — specifiek de `PromptShield`-laag die prompts analyseert vóórdat ze het model bereiken [\[4\]](#bronnen). De foutcode `ResponsibleAIPolicyViolation` met actie `block` betekent dat de prompt zelf is tegengehouden, niet de response [\[4\]](#bronnen).

De `[ANIM: standard_waiting]`-instructie triggert waarschijnlijk de **prompt injection detection** van Azure: een instructie in een ongebruikelijk formaat (`[SLEUTELWOORD: waarde]`) die het gedrag van het model wil sturen via een specifiek output-patroon. Azure's PromptShield herkent dit als een potentiële jailbreak-poging of manipulatie-instructie [\[4\]](#bronnen).

### Vraag 3: Kan Azure AI per LLM aparte regels instellen?

**Ja — maar alleen voor first-party modellen.** De configuratie werkt op deployment-niveau in Azure AI Foundry [\[2\]](#bronnen):

- Per deployment kun je voor OpenAI-modellen severity-drempels instellen per categorie (hate, violence, sexual, self-harm) voor zowel prompt als completion [\[2\]](#bronnen).
- Voor third-party model-deployments (zoals DeepSeek) is de content filter **platform-wide verplicht** ingesteld op `Microsoft.DefaultV2` — dit kan niet worden aangepast via de portal, API of Portkey [\[1\]](#bronnen)[\[3\]](#bronnen).

Dit is een bewuste beleidskeuze van Microsoft (ingevoerd begin 2025 voor alle third-party modellen in Azure AI Foundry) om consistente compliance te garanderen ongeacht de model-provider [\[1\]](#bronnen).

### Conclusie op de vragen

De blokkade is niet te omzeilen zolang DeepSeek via Azure AI gehost wordt. Er zijn drie opties:
1. **System prompt aanpassen** (gekozen workaround) — verwijder instructies die op prompt injection lijken
2. **Andere provider** — DeepSeek via OpenRouter of de directe DeepSeek API, buiten Azure [\[5\]](#bronnen)
3. **Andere Azure deployment** — een eigen Azure-abonnement met first-party model-rechten, wat ook geen garantie geeft voor third-party modellen [\[3\]](#bronnen)

---

## Workaround

`CHAT_SYSTEM_NO_ANIM` — identieke system prompt zonder de ANIM-tag-instructie [\[6\]](#bronnen):

```python
CHAT_SYSTEM_NO_ANIM = (
    "Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
    "Je spreekt met een testpatiënt. "
    "Spreek altijd Nederlands. Stel maximaal één vervolgvraag."
)
```

De ANIM-tag-instructie is uitsluitend bedoeld om de frontend-avatar te triggeren. In de evaluatiepipeline worden ANIM-tags toch gestript uit alle responses vóór scoring [\[6\]](#bronnen):

```python
clean_response = re.sub(r'\[ANIM:[^\]]+\]', '', response).strip()
```

Het weglaten van de instructie heeft dus **geen impact op de evaluatieeerlijkheid**.

---

## Impact

- **Evaluatie:** Opgelost via workaround — DeepSeek is volledig geëvalueerd
- **Productie:** DeepSeek is **niet bruikbaar als chat-model** in Anna Remembers zonder aanpassing van de system prompt. De productie-prompt bevat de ANIM-tag-instructie standaard [\[4\]](#bronnen).
- **Alternatief:** DeepSeek via een niet-Azure provider zou het filter omzeilen, maar vereist een nieuw Portkey virtual key [\[5\]](#bronnen).

---

## Bronnen

1. Azure AI Foundry — Content filter configurability (first-party vs third-party): https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/content-filter-configurability
2. Azure AI Foundry — Content filters instellen per deployment: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/content-filters
3. Microsoft Q&A — Content filter voor non-OpenAI modellen verwijderen: https://learn.microsoft.com/en-us/answers/questions/5540350/how-to-remove-content-filter-for-non-openai-models
4. Azure OpenAI content filter overzicht (PromptShield, ResponsibleAI): https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/content-filter
5. Portkey virtual keys: `backend/services/llm.py` → `PortkeyProvider`
6. Workaround geïmplementeerd in: `backend/scripts/eval_chat.py`
