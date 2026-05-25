"""Tests for backend/routers/voice_samples.py."""
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import app


class TestVoiceSamplesRouter:
    def test_list_returns_wav_filenames(self, tmp_path: Path):
        (tmp_path / "anna.wav").touch()
        (tmp_path / "voice2.wav").touch()
        with patch("routers.voice_samples.VOICE_DIR", str(tmp_path)):
            client = TestClient(app)
            resp = client.get("/tts/voice-samples")
            assert resp.status_code == 200
            assert set(resp.json()["samples"]) == {"anna.wav", "voice2.wav"}

    def test_list_returns_empty_when_dir_missing(self, tmp_path: Path):
        missing = str(tmp_path / "nonexistent")
        with patch("routers.voice_samples.VOICE_DIR", missing):
            client = TestClient(app)
            resp = client.get("/tts/voice-samples")
            assert resp.status_code == 200
            assert resp.json()["samples"] == []

    def test_upload_mp3_converts_and_saves_as_wav(self, tmp_path: Path):
        fake_wav = b"RIFF\x24\x00\x00\x00WAVEfmt "
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch("routers.voice_samples._reload_xtts", new_callable=AsyncMock),
            patch("routers.voice_samples.convert_to_wav", return_value=fake_wav) as mock_convert,
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("opname.mp3", b"fake-mp3", "audio/mpeg")},
            )
            assert resp.status_code == 200
            assert resp.json()["filename"] == "opname.wav"
            assert (tmp_path / "opname.wav").read_bytes() == fake_wav
            mock_convert.assert_called_once_with(b"fake-mp3", "opname.mp3")

    def test_upload_wav_also_runs_through_converter(self, tmp_path: Path):
        fake_wav = b"RIFF\x00\x00\x00\x00WAVEfmt "
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch("routers.voice_samples._reload_xtts", new_callable=AsyncMock),
            patch("routers.voice_samples.convert_to_wav", return_value=fake_wav),
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("stem.wav", b"raw-wav", "audio/wav")},
            )
            assert resp.status_code == 200
            assert resp.json()["filename"] == "stem.wav"

    def test_upload_unsupported_format_returns_400(self, tmp_path: Path):
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch(
                "routers.voice_samples.convert_to_wav",
                side_effect=ValueError("Bestandstype '.pdf' niet ondersteund"),
            ),
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("doc.pdf", b"fake", "application/pdf")},
            )
            assert resp.status_code == 400
            assert "niet ondersteund" in resp.json()["detail"]

    def test_upload_corrupt_audio_returns_422(self, tmp_path: Path):
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch(
                "routers.voice_samples.convert_to_wav",
                side_effect=RuntimeError("ffmpeg conversie mislukt: Invalid data"),
            ),
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("corrupt.mp3", b"garbage", "audio/mpeg")},
            )
            assert resp.status_code == 422
            assert "ffmpeg" in resp.json()["detail"]

    def test_delete_removes_file_and_calls_reload(self, tmp_path: Path):
        target = tmp_path / "anna.wav"
        target.write_bytes(b"fake-wav")
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch("routers.voice_samples._reload_xtts", new_callable=AsyncMock) as mock_reload,
        ):
            client = TestClient(app)
            resp = client.delete("/tts/voice-samples/anna.wav")
            assert resp.status_code == 200
            assert not target.exists()
            mock_reload.assert_called_once()

    def test_delete_returns_404_for_unknown_file(self, tmp_path: Path):
        with patch("routers.voice_samples.VOICE_DIR", str(tmp_path)):
            client = TestClient(app)
            resp = client.delete("/tts/voice-samples/missing.wav")
            assert resp.status_code == 404

    def test_delete_rejects_path_traversal(self, tmp_path: Path):
        with patch("routers.voice_samples.VOICE_DIR", str(tmp_path)):
            client = TestClient(app)
            # Encoded backslash: Starlette blocks %2F in path params; this reaches the handler.
            resp = client.delete("/tts/voice-samples/..%5Csecrets.txt")
            assert resp.status_code == 400
