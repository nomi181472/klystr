#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="klystr-bookstore"

BOLD="\033[1m"
CYAN="\033[0;36m"
GREEN="\033[0;32m"
NC="\033[0m"

echo -e "${BOLD}Cleaning up Klystr Bookstore Telemetry Environment (${NAMESPACE})...${NC}"

KUBECTL=""
if command -v microk8s >/dev/null 2>&1 && microk8s kubectl get nodes >/dev/null 2>&1; then
  KUBECTL="microk8s kubectl"
elif command -v kubectl >/dev/null 2>&1; then
  KUBECTL="kubectl"
fi

# Terminate any background port-forwarding on port 8088
fuser -k 8088/tcp >/dev/null 2>&1 || true
pkill -f "port-forward.*8088:80" >/dev/null 2>&1 || true

if [ -n "${KUBECTL}" ]; then
  ${KUBECTL} delete namespace "${NAMESPACE}" --ignore-not-found=true --timeout=30s 2>/dev/null || true
fi

# If running docker-compose
if [ -f "docker-compose.yml" ]; then
  if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    podman compose down -v 2>/dev/null || true
  elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose down -v 2>/dev/null || true
  fi
fi

echo -e "${GREEN}Cleanup complete.${NC}"
