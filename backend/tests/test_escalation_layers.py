"""Tests for layered escalation detection (Layer 0 keywords + Layer 1 JSON parse)."""

import pytest

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


@pytest.mark.asyncio
async def test_layer1_uses_openai_compat_when_configured(monkeypatch):
    """When ESCALATION_PROVIDER=openai_compat, layer1 must call OpenAI SDK, not Ollama."""
    import backend.routers.chat._escalation as esc_module
    from unittest.mock import AsyncMock, MagicMock, patch

    monkeypatch.setattr(esc_module, "_ESCALATION_PROVIDER", "openai_compat")
    monkeypatch.setattr(esc_module, "_ESCALATION_API_KEY", "ds-test-key")
    monkeypatch.setattr(esc_module, "_ESCALATION_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setattr(esc_module, "_ESCALATION_MODEL", "deepseek-chat")

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '{"escalate": false, "urgency": "low", "reason": "test"}'

    with patch("openai.AsyncOpenAI") as mock_openai_class:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_openai_class.return_value = mock_client

        raw = await esc_module._classify_openai_compat("ik voel me goed")
        assert raw == '{"escalate": false, "urgency": "low", "reason": "test"}'
        mock_openai_class.assert_called_once()
        call_kwargs = mock_openai_class.call_args.kwargs
        assert call_kwargs["base_url"] == "https://api.deepseek.com/v1"
