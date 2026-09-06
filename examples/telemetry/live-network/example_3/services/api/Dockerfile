FROM docker.io/library/python:3.11-slim

LABEL maintainer="Botonetics Klystr Telemetry Team"
LABEL repository="botonetics/klyster-telemetry-example_3_api"
LABEL description="Klystr Telemetry Example 3 - Book & User Management API Service"

WORKDIR /app

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY schema.sql .
COPY server.py .

ENV PORT=8080 \
    PYTHONUNBUFFERED=1 \
    SCHEMA_FILE=/app/schema.sql

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1

CMD ["python", "server.py"]
