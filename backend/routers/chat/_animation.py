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

# Regex to extract [ANIM: x] prefix from LLM output
_ANIM_TAG_RE = re.compile(
    r"^\s*\[?\s*ANIM\s*[:=]?\s*([^\]\r\n]+?)\s*\]?\s*(?:\r?\n|$)",
    re.IGNORECASE,
)


def strip_anim_tag(text: str) -> tuple[str, str | None]:
    """Strip and validate LLM [ANIM: x] tag.

    Returns:
        (clean_text, animation_or_None_if_invalid)
        If tag is found and valid, returns cleaned text and animation key.
        If tag is found but invalid, returns cleaned text and None.
        If no tag, returns original text and None.
    """
    if not text:
        return text, None

    match = _ANIM_TAG_RE.match(text)
    if not match:
        return text, None

    raw_value = match.group(1).strip().strip("[]").strip()
    clean_text = text[match.end() :].lstrip()

    # Check if raw value is in our canonical set (case-insensitive)
    for anim in ANIMATIONS:
        if raw_value.lower() == anim.lower():
            return clean_text, anim

    # Tag found but value invalid
    return clean_text, None


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
