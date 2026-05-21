FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

ENV COQUI_TOS_AGREED=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    TZ=Europe/Amsterdam

# System deps for audio
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        git \
        tzdata \
    && ln -fs /usr/share/zoneinfo/$TZ /etc/localtime \
    && rm -rf /var/lib/apt/lists/*

# Use the maintained Coqui TTS fork (idiap/coqui-ai-TTS)
RUN pip install --upgrade pip \
    && pip install flask "coqui-tts>=0.24" "transformers>=4.43,<=4.46.2"

WORKDIR /app
COPY xtts_bridge.py .

EXPOSE 5000
CMD ["python", "xtts_bridge.py"]
