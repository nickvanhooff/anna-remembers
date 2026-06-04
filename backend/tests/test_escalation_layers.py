"""Tests for layered escalation detection (Layer 0 keywords + Layer 1 JSON parse)."""

from routers.chat._escalation import (
    format_escalation_reason,
    layer0_check,
    _parse_classify_json,
)


def test_layer0_high_keyword():
    urgency, reason = layer0_check("Ik ben bewusteloos gevallen")
    assert urgency == "high"
    assert "bewusteloos" in reason


def test_layer0_medium_ik_verbrand():
    urgency, reason = layer0_check("ik verbrand")
    assert urgency == "medium"
    assert "verbrand" in reason


def test_layer0_no_match_greeting():
    urgency, _ = layer0_check("olla")
    assert urgency == ""


def test_parse_escalation_json_plain():
    raw = '{"escalate": true, "urgency": "medium", "reason": "burning"}'
    result = _parse_classify_json(raw)
    assert result is not None
    assert result["escalate"] is True


def test_format_escalation_reason_includes_patient_message():
    reason = format_escalation_reason(
        layer_label="Laag 1 (qwen2.5:0.5b)",
        patient_message="Mijn enkels zijn dikker geworden",
        detail="vochtophoping vermoed",
    )
    assert "Patiëntbericht:" in reason
    assert "Mijn enkels zijn dikker geworden" in reason
    assert "vochtophoping vermoed" in reason


def test_parse_escalation_json_with_fences():
    raw = '```json\n{"escalate": false, "urgency": "medium", "reason": "greeting"}\n```'
    result = _parse_classify_json(raw)
    assert result is not None
    assert result["escalate"] is False
