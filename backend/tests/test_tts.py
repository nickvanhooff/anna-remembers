"""Tests for backend/routers/tts.py — provider routing."""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from models.setting import Setting
from services.database import get_db


def _db_with_provider(provider: str):
    mock_db = MagicMock()
    mock_setting = Setting(key="tts_provider", value=provider)
    mock_db.query.return_value.filter.return_value.first.return_value = mock_setting
    return mock_db


class TestTTSProviderRouting:
    def test_routes_to_piper_when_setting_is_piper(self):
        app.dependency_overrides[get_db] = lambda: _db_with_provider("piper")
        with patch("routers.tts.synthesize", new_callable=AsyncMock) as mock_synth:
            mock_synth.return_value = b"fake-wav"
            client = TestClient(app)
            try:
                response = client.post("/tts", json={"text": "hallo"})
                assert response.status_code == 200
                mock_synth.assert_called_once_with("hallo", "piper")
            finally:
                app.dependency_overrides.clear()

    def test_routes_to_xtts_when_setting_is_xtts(self):
        app.dependency_overrides[get_db] = lambda: _db_with_provider("xtts")
        with patch("routers.tts.synthesize", new_callable=AsyncMock) as mock_synth:
            mock_synth.return_value = b"fake-wav"
            client = TestClient(app)
            try:
                response = client.post("/tts", json={"text": "hallo"})
                assert response.status_code == 200
                mock_synth.assert_called_once_with("hallo", "xtts")
            finally:
                app.dependency_overrides.clear()

    def test_falls_back_to_xtts_when_setting_missing(self):
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        app.dependency_overrides[get_db] = lambda: mock_db
        with patch("routers.tts.synthesize", new_callable=AsyncMock) as mock_synth:
            mock_synth.return_value = b"fake-wav"
            client = TestClient(app)
            try:
                response = client.post("/tts", json={"text": "hallo"})
                assert response.status_code == 200
                mock_synth.assert_called_once_with("hallo", "xtts")
            finally:
                app.dependency_overrides.clear()
