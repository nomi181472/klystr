FROM docker.io/library/nginx:alpine

LABEL maintainer="Botonetics Klystr Telemetry Team"
LABEL repository="botonetics/klyster-telemetry-example_3_frontend"
LABEL description="Klystr Telemetry Example 3 - Interactive Bookstore SPA Web App"

# Install curl for health checks
RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/nginx.conf
COPY public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
