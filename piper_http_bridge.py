#!/usr/bin/env python3
"""HTTP bridge for Piper TTS that handles voice synthesis directly."""

import io
import sys
import wave

from flask import Flask, request, send_file

app = Flask(__name__)

try:
    import piper
except ImportError:
    print("Error: piper-tts not installed", file=sys.stderr, flush=True)
    sys.exit(1)

voice_path = "/config/en_US-libritts-high.onnx"
config_path = "/config/en_US-libritts-high.onnx.json"

print(f"Loading voice from {voice_path}", file=sys.stderr, flush=True)
voice = piper.PiperVoice.load(voice_path, config_path=config_path, use_cuda=False)
print("✓ Voice loaded successfully", file=sys.stderr, flush=True)


@app.route("/", methods=["POST"])
def synthesize():
    """Synthesize text to speech. Accepts ?text=... or {"text": "..."}. Returns audio/wav."""
    text = request.args.get("text") or (request.json.get("text") if request.is_json else None)

    if not text or not text.strip():
        return {"error": "Missing or empty text parameter"}, 400

    try:
        # piper-tts 1.4.x: write WAV bytes via wave.Wave_write wrapper around BytesIO
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav_file:
            voice.synthesize_wav(text.strip(), wav_file)
        buf.seek(0)
        size = len(buf.getvalue())
        print(f"Synthesized {size} bytes for: {text[:60]}", file=sys.stderr, flush=True)
        return send_file(buf, mimetype="audio/wav")
    except Exception as e:
        print(f"Error synthesizing: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"error": str(e)}, 500


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    print("✓ Piper HTTP Bridge starting on 0.0.0.0:5000", file=sys.stderr, flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
