"""Tests voor gelaagde escalatiedetectie (Laag 0 keywords + JSON-parse Laag 1)."""

from routers.chat import _layer0_check, _parse_escalation_json


def test_layer0_high_keyword():
    urgency, reason = _layer0_check("Ik ben bewusteloos gevallen")
    assert urgency == "high"
    assert "bewusteloos" in reason


def test_layer0_medium_ik_verbrand():
    urgency, reason = _layer0_check("ik verbrand")
    assert urgency == "medium"
    assert "verbrand" in reason


def test_layer0_no_match_greeting():
    urgency, _ = _layer0_check("olla")
    assert urgency == ""


def test_parse_escalation_json_plain():
    raw = '{"escalate": true, "urgency": "medium", "reason": "burning"}'
    result = _parse_escalation_json(raw)
    assert result is not None
    assert result["escalate"] is True


def test_parse_escalation_json_with_fences():
    raw = '```json\n{"escalate": false, "urgency": "medium", "reason": "greeting"}\n```'
    result = _parse_escalation_json(raw)
    assert result is not None
    assert result["escalate"] is False
