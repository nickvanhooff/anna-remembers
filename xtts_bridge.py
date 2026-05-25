#!/usr/bin/env python3
"""HTTP bridge for Coqui XTTS v2 — Dutch voice cloning from a reference sample.

Same endpoint shape as piper_http_bridge.py so the backend can swap providers
by only changing the upstream URL.

POST /        ?text=...  or  {"text": "..."}   -> audio/wav
POST /reload                                    -> {"status": "ok", "samples": N}
GET  /health                                    -> {"status": "ok"}
"""

import glob
import io
import os
import sys
import wave

import numpy as np
import torch
from flask import Flask, request, send_file

# Coqui non-commercial model license must be accepted via env var.
os.environ.setdefault("COQUI_TOS_AGREED", "1")

from TTS.api import TTS  # noqa: E402

app = Flask(__name__)

VOICE_DIR = os.getenv("XTTS_VOICE_DIR", "/voice")
LANGUAGE = os.getenv("XTTS_LANGUAGE", "nl")
MODEL_NAME = os.getenv("XTTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")

# Mutable list — can be updated via /reload without restart.
_voice_samples: list[str] = sorted(glob.glob(os.path.join(VOICE_DIR, "*.wav")))
if not _voice_samples:
    print(f"ERROR: no WAV files found in {VOICE_DIR}", file=sys.stderr, flush=True)
    sys.exit(1)
print(f"Using {len(_voice_samples)} reference clip(s): {_voice_samples}", file=sys.stderr, flush=True)

use_gpu = torch.cuda.is_available()
device = "cuda" if use_gpu else "cpu"
print(f"Loading XTTS v2 (device={device})...", file=sys.stderr, flush=True)
tts = TTS(MODEL_NAME).to(device)
print(f"Language: {LANGUAGE}", file=sys.stderr, flush=True)
print("Model loaded.", file=sys.stderr, flush=True)


def _wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    """Encode float32 mono samples as a 16-bit PCM WAV in memory."""
    pcm = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    pcm_int16 = (pcm * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm_int16.tobytes())
    buf.seek(0)
    return buf


@app.route("/", methods=["POST"])
def synthesize():
    text = request.args.get("text") or (request.json.get("text") if request.is_json else None)
    if not text or not text.strip():
        return {"error": "Missing or empty text parameter"}, 400

    if not _voice_samples:
        return {"error": "No voice samples available"}, 503

    try:
        wav = tts.tts(text=text.strip(), speaker_wav=list(_voice_samples), language=LANGUAGE)
        sample_rate = tts.synthesizer.output_sample_rate
        buf = _wav_bytes(np.array(wav), sample_rate)
        print(f"Synthesized {len(buf.getvalue())} bytes for: {text[:60]}", file=sys.stderr, flush=True)
        return send_file(buf, mimetype="audio/wav")
    except Exception as exc:
        print(f"Error synthesizing: {exc}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"error": str(exc)}, 500


@app.route("/reload", methods=["POST"])
def reload_samples():
    """Rescan /voice/*.wav and refresh the speaker list without restart."""
    global _voice_samples
    _voice_samples = sorted(glob.glob(os.path.join(VOICE_DIR, "*.wav")))
    print(f"Reloaded: {len(_voice_samples)} sample(s)", file=sys.stderr, flush=True)
    return {"status": "ok", "samples": len(_voice_samples)}, 200


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    print("XTTS HTTP Bridge listening on 0.0.0.0:5000", file=sys.stderr, flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
