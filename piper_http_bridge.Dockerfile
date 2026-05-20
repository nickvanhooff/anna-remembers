FROM python:3.11-slim

# Install Flask and Piper TTS
RUN pip install --no-cache-dir flask piper-tts

# Create app directory
WORKDIR /app

# Copy bridge script
COPY piper_http_bridge.py .

# Expose port
EXPOSE 5000

# Run Flask server
CMD ["python", "piper_http_bridge.py"]
