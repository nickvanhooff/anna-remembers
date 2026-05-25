"""Unit tests for services/audio_converter.py."""
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from services.audio_converter import ALLOWED_EXTENSIONS, convert_to_wav


class TestConvertToWav:
    def test_mp3_calls_ffmpeg_and_returns_wav_bytes(self):
        fake_wav = b"RIFF\x24\x00\x00\x00WAVEfmt "

        def fake_ffmpeg(cmd, **kwargs):
            output_path = Path(cmd[-1])
            output_path.write_bytes(fake_wav)
            return MagicMock(returncode=0, stderr=b"")

        with patch("services.audio_converter.subprocess.run", side_effect=fake_ffmpeg):
            result = convert_to_wav(b"fake-mp3-data", "opname.mp3")

        assert result == fake_wav

    def test_ffmpeg_args_contain_correct_sample_rate_and_channels(self):
        fake_wav = b"RIFF\x00\x00\x00\x00WAVEfmt "

        def fake_ffmpeg(cmd, **kwargs):
            Path(cmd[-1]).write_bytes(fake_wav)
            return MagicMock(returncode=0, stderr=b"")

        with patch("services.audio_converter.subprocess.run", side_effect=fake_ffmpeg) as mock_run:
            convert_to_wav(b"data", "stem.m4a")

        cmd = mock_run.call_args[0][0]
        assert "-ar" in cmd
        assert "22050" in cmd
        assert "-ac" in cmd
        assert "1" in cmd
        assert "-c:a" in cmd
        assert "pcm_s16le" in cmd

    def test_raises_value_error_for_unsupported_extension(self):
        with pytest.raises(ValueError, match="niet ondersteund"):
            convert_to_wav(b"data", "document.pdf")

    def test_raises_runtime_error_when_ffmpeg_fails(self):
        with patch("services.audio_converter.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1, stderr=b"Invalid data found when processing input"
            )
            with pytest.raises(RuntimeError, match="ffmpeg conversie mislukt"):
                convert_to_wav(b"corrupt", "broken.mp3")

    def test_allowed_extensions_contains_common_formats(self):
        assert ".wav" in ALLOWED_EXTENSIONS
        assert ".mp3" in ALLOWED_EXTENSIONS
        assert ".m4a" in ALLOWED_EXTENSIONS
        assert ".webm" in ALLOWED_EXTENSIONS
        assert ".ogg" in ALLOWED_EXTENSIONS
