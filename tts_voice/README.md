# Voice sample for XTTS v2 cloning

Place a single file here named `voice_sample.wav`.

## Requirements
- **Format:** WAV (16-bit PCM, mono preferred)
- **Length:** 6-30 seconds (10-15s is ideal)
- **Content:** Spoken Dutch, single speaker (you), no background noise/music
- **Sample rate:** 16 kHz or higher (XTTS resamples internally)

## Recording tips
- Quiet room, microphone close
- Speak naturally — read a short paragraph in Dutch
- Avoid long silences at start/end (trim them)

## Converting from MP3/M4A
If you record on a phone:
```
ffmpeg -i recording.m4a -ac 1 -ar 22050 voice_sample.wav
```

After dropping the file here, restart the xtts-bridge container:
```
docker compose restart xtts-bridge
```
