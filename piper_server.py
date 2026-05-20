#!/usr/bin/env python3
"""Simple HTTP server for Piper TTS with auto-download from Hugging Face."""

import io
import sys
import urllib.request
from pathlib import Path

from flask import Flask, request, send_file

app = Flask(__name__)

# Initialize Piper voice
# TODO: Find working Dutch voice (nl_NL-mls not found on HF)
# Fallback to English for MVP (en_US-hfc is reliably available)
VOICE = "en_US-hfc"
voice_dir = Path.home() / ".local" / "share" / "piper" / "voices"
voice_path = voice_dir / f"{VOICE}.onnx"
config_path = voice_dir / f"{VOICE}.onnx.json"

print(f"Starting Piper TTS server with voice: {VOICE}", file=sys.stderr, flush=True)

# Ensure voice is downloaded
if not voice_path.exists() or not config_path.exists():
    print(f"Downloading voice {VOICE} from Hugging Face...", file=sys.stderr, flush=True)
    voice_dir.mkdir(parents=True, exist_ok=True)

    # Download from Hugging Face
    base_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices/"
    files_to_download = [
        (f"{VOICE}.onnx", voice_path),
        (f"{VOICE}.onnx.json", config_path),
    ]

    for filename, filepath in files_to_download:
        url = base_url + filename
        print(f"  Downloading {filename}...", file=sys.stderr, flush=True)
        try:
            urllib.request.urlretrieve(url, filepath)
            print(f"  ✓ {filename} downloaded", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"  ✗ Failed to download {filename}: {e}", file=sys.stderr, flush=True)
            sys.exit(1)

if not voice_path.exists() or not config_path.exists():
    print(f"Voice files still missing after download", file=sys.stderr, flush=True)
    sys.exit(1)

print(f"✓ Voice ready: {voice_path}", file=sys.stderr, flush=True)

# Import piper after voice is ready
import piper


@app.route("/", methods=["POST"])
def synthesize():
    """Synthesize text to speech.

    Expects query param or POST body with text.
    Returns audio/wav bytes.
    """
    # Get text from query param or request body
    text = request.args.get("text") or (request.json.get("text") if request.json else None)

    if not text or not text.strip():
        return {"error": "Missing or empty text parameter"}, 400

    try:
        # Synthesize speech
        audio_data = io.BytesIO()
        with piper.PiperVoice.load(str(voice_path), config_path=str(config_path), use_cuda=False) as voice:
            voice.synthesize(text, audio_data)
        audio_data.seek(0)
        return send_file(audio_data, mimetype="audio/wav")
    except Exception as e:
        print(f"Error synthesizing: {e}", file=sys.stderr, flush=True)
        return {"error": str(e)}, 500


if __name__ == "__main__":
    print("✓ Flask server starting on 0.0.0.0:5000", file=sys.stderr, flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
