FROM python:3.11-slim

# Install Piper, Flask, and dependencies
RUN pip install --no-cache-dir piper-tts flask

# Create app directory
WORKDIR /app

# Copy piper server script
COPY piper_server.py .

# Expose port
EXPOSE 5000

# Run Flask server
CMD ["python", "piper_server.py"]
