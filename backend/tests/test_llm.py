import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_portkey_provider_calls_chat_completions():
    """PortkeyProvider must use portkey_ai.AsyncPortkey and return model response."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "antwoord"
    mock_response.usage.prompt_tokens = 10
    mock_response.usage.completion_tokens = 5

    with patch("portkey_ai.AsyncPortkey") as mock_portkey_class:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_portkey_class.return_value = mock_client

        from services.llm import PortkeyProvider
        provider = PortkeyProvider(api_key="pk-test", model="gpt-4.1", config=None)
        result = await provider.chat([{"role": "user", "content": "hallo"}])

        assert result == "antwoord"
        mock_portkey_class.assert_called_once_with(api_key="pk-test", config=None)
