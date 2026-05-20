#!/usr/bin/env python3
"""HTTP bridge for Piper TTS that handles voice synthesis directly."""

import io
import sys

from flask import Flask, request, send_file

app = Flask(__name__)

# Try to import piper
try:
    import piper
except ImportError:
    print("Error: piper-tts not installed", file=sys.stderr, flush=True)
    sys.exit(1)

# Load voice once at startup
voice_path = "/config/en_US-libritts-high.onnx"
config_path = "/config/en_US-libritts-high.onnx.json"

print(f"Loading voice from {voice_path}", file=sys.stderr, flush=True)
voice = piper.PiperVoice.load(str(voice_path), config_path=str(config_path), use_cuda=False)
print(f"✓ Voice loaded successfully", file=sys.stderr, flush=True)


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
        voice.synthesize(text.strip(), audio_data)
        audio_data.seek(0)
        return send_file(audio_data, mimetype="audio/wav")
    except Exception as e:
        print(f"Error synthesizing: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"error": str(e)}, 500


if __name__ == "__main__":
    print("✓ Piper HTTP Bridge starting on 0.0.0.0:5000", file=sys.stderr, flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
