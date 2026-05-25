"""Convert audio files to WAV suitable for XTTS v2 voice cloning.

XTTS v2 expects speaker reference audio with:
  - 22050 Hz sample rate (used internally for feature extraction)
  - mono (1 channel)
  - 16-bit PCM (pcm_s16le)
XTTS synthesis output is 24000 Hz — different from the reference input rate.
"""
import subprocess
import tempfile
from pathlib import Path

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".aac"}

# XTTS v2 processes speaker reference audio internally at 22050 Hz.
_XTTS_SAMPLE_RATE = "22050"


def convert_to_wav(data: bytes, original_filename: str) -> bytes:
    """Convert audio data to XTTS-compatible WAV (22050 Hz mono pcm_s16le).

    Raises:
        ValueError: if the file type is not in ALLOWED_EXTENSIONS.
        RuntimeError: if ffmpeg cannot perform the conversion.
    """
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Bestandstype '{ext}' niet ondersteund. "
            f"Toegestaan: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        input_path = tmp / f"input{ext}"
        output_path = tmp / "output.wav"

        input_path.write_bytes(data)

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(input_path),
                "-ar",
                _XTTS_SAMPLE_RATE,  # 22050 Hz — XTTS v2 speaker reference rate
                "-ac",
                "1",  # mono
                "-c:a",
                "pcm_s16le",  # 16-bit PCM WAV
                str(output_path),
            ],
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg conversie mislukt: {result.stderr.decode(errors='replace')[:300]}"
            )

        return output_path.read_bytes()
