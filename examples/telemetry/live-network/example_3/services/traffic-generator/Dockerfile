FROM docker.io/library/python:3.11-alpine

LABEL maintainer="Botonetics Klystr Telemetry Team"
LABEL repository="botonetics/klyster-telemetry-example_3_traffic_gen"
LABEL description="Klystr Telemetry Example 3 - Microservice Traffic Generator"

WORKDIR /app

COPY generator.py .

ENV TARGET_URL="http://frontend:80" \
    BASE_RPS="5.0" \
    PYTHONUNBUFFERED="1"

CMD ["python", "generator.py"]
