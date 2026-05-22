"""Animation resolution utility for Anna's avatar — parses [ANIM: x] tags and user intent."""

import re

# Valid animation keys matching frontend/public/ GLB filenames
ANIMATIONS = {
    "standard_waiting",
    "stand_look_around",
    "running_fast",
    "standard_walk_crouching",
    "flexing_arm",
    "gorilla",
    "laying_on_floor",
    "just_chilling",
    "angry",
    "Expressing_joy",
    "model",
    "model (13)",
}

DEFAULT_ANIMATION = "standard_waiting"

# User keyword rules — ordered list of (keywords, animation) tuples.
# First matching rule wins; uses substring matching on lowercased user text.
USER_KEYWORD_RULES: list[tuple[tuple[str, ...], str]] = [
    (("model (13)", "model 13"), "model (13)"),
    (("model",), "model"),
    (("gorilla",), "gorilla"),
    (("renn", "hardloop", "sprint", "marathon"), "running_fast"),
    (
        (
            "hurk",
            "gehurkt",
            "kruip",
            "crouch",
            "squat",
            "door m'n knie",
            "door mijn knie",
        ),
        "standard_walk_crouching",
    ),
    (("op de grond", "op de vloer", "neergevallen", "ik ben gevallen", "lig op"), "laying_on_floor"),
    (
        ("flex", "biceps", "spierbal", "krachttraining", "span mijn arm", "arm aanspannen"),
        "flexing_arm",
    ),
    (("heel erg blij", "superblij", "gelukkig", "fantastisch", "geweldig"), "Expressing_joy"),
    (("boos", "kwaad", "woedend"), "angry"),
    (("wacht", "even wachten", "momentje"), "standard_waiting"),
    (("chill", "relax", "rustig aan", "niks doen"), "just_chilling"),
    (("rondkijk", "rond kijken", "om me heen", "kijk rond"), "stand_look_around"),
]

# Matches [ANIM: x] at the start of the text (to extract animation value from prefix).
_ANIM_TAG_START_RE = re.compile(
    r"^\s*\[?\s*ANIM\s*[:=]?\s*([^\]\r\n]+?)\s*\]?\s*(?:\r?\n|$)",
    re.IGNORECASE,
)

# Matches [ANIM: x] anywhere in the text (to scrub mid-text tags the LLM sneaked in).
_ANIM_TAG_ANY_RE = re.compile(
    r"\[ANIM\s*[:=]\s*[^\]\r\n]+?\]",
    re.IGNORECASE,
)

_ANIM_LOOKUP = {a.lower(): a for a in ANIMATIONS}


def _validate(raw: str) -> str | None:
    return _ANIM_LOOKUP.get(raw.strip().strip("[]").strip().lower())


def strip_anim_tag(text: str) -> tuple[str, str | None]:
    """Strip all [ANIM: x] tags from LLM output and return the animation value.

    Checks the start of the text first (preferred position). If the LLM placed
    the tag mid-text instead, we still capture it and always scrub it so it
    never leaks into stored content or TTS.

    Returns:
        (clean_text, animation_or_None_if_invalid)
    """
    if not text:
        return text, None

    animation: str | None = None

    # Try start first — this is where the prompt instructs the LLM to put the tag.
    start_match = _ANIM_TAG_START_RE.match(text)
    if start_match:
        animation = _validate(start_match.group(1))
        text = text[start_match.end():].lstrip()

    # If not at start, search anywhere for the first valid tag.
    if animation is None:
        any_match = _ANIM_TAG_ANY_RE.search(text)
        if any_match:
            # Extract value between the colon/equals and the closing bracket.
            inner = re.search(r"[:=]\s*([^\]\r\n]+)", any_match.group(), re.IGNORECASE)
            if inner:
                animation = _validate(inner.group(1))

    # Always scrub every remaining [ANIM: x] tag from the text.
    clean_text = _ANIM_TAG_ANY_RE.sub("", text).strip()

    return clean_text, animation


def _check_user_keywords(user_text: str) -> str | None:
    """Check user message for animation keywords.

    Returns animation key if a clear keyword match is found, else None.
    Checks in rule order; first match wins.
    """
    t = (user_text or "").lower().strip()
    if not t:
        return None

    for keywords, animation in USER_KEYWORD_RULES:
        if any(kw in t for kw in keywords):
            return animation

    return None


def resolve_animation(user_text: str, llm_text: str) -> tuple[str, str]:
    """Resolve animation for Anna's avatar response.

    Priority:
    1. User keyword check (dominant signal)
    2. LLM [ANIM: x] tag (if valid)
    3. Default (standard_waiting)

    Args:
        user_text: The patient's message.
        llm_text: Anna's raw response (may include [ANIM: x] prefix).

    Returns:
        (clean_llm_text, animation_key)
        clean_llm_text has the [ANIM: x] tag stripped.
        animation_key is a valid animation from ANIMATIONS or DEFAULT_ANIMATION.
    """
    # Always strip the tag first, regardless of which branch we take
    clean_text, llm_animation = strip_anim_tag(llm_text)

    # Priority 1: User keyword check
    user_animation = _check_user_keywords(user_text)
    if user_animation:
        return clean_text, user_animation

    # Priority 2: LLM tag (if valid)
    if llm_animation:
        return clean_text, llm_animation

    # Priority 3: Default
    return clean_text, DEFAULT_ANIMATION
