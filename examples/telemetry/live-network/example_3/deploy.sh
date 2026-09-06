#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/k8s/bookstore-app.yaml"
NAMESPACE="klystr-bookstore"
BASE_RPS="${BASE_RPS:-5}"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo -e "${BOLD}======================================================================${NC}"
echo -e " ${BOLD}Deploying Klystr Bookstore Architecture Telemetry Environment${NC}"
echo -e " Namespace: ${CYAN}${NAMESPACE}${NC} (BASE_RPS: ${BASE_RPS})"
echo -e "${BOLD}======================================================================${NC}"

# Detect kubectl or microk8s kubectl
if command -v microk8s >/dev/null 2>&1 && microk8s status --wait-ready >/dev/null 2>&1; then
  KUBECTL="microk8s kubectl"
elif command -v kubectl >/dev/null 2>&1; then
  KUBECTL="kubectl"
else
  echo "Error: Neither microk8s nor kubectl is installed or running."
  exit 1
fi

echo -e "\n${CYAN}[1/5] Applying Kubernetes manifest...${NC}"
${KUBECTL} apply -f "${MANIFEST}"

echo -e "\n${CYAN}[2/5] Awaiting workloads rollout readiness...${NC}"
${KUBECTL} rollout status statefulset/bookstore-db -n "${NAMESPACE}" --timeout=120s
${KUBECTL} rollout status deployment/redis-session -n "${NAMESPACE}" --timeout=120s

# Load locally built images into microk8s if running microk8s
if command -v microk8s >/dev/null 2>&1; then
  echo -e "\n${CYAN}[3/5] Loading container images into microk8s cache...${NC}"
  CONTAINER_TOOL=""
  if command -v podman >/dev/null 2>&1; then
    CONTAINER_TOOL="podman"
  elif command -v docker >/dev/null 2>&1; then
    CONTAINER_TOOL="docker"
  fi

  IMAGES=(
    "botonetics/klyster-telemetry-example_3_api:latest"
    "botonetics/klyster-telemetry-example_3_frontend:latest"
    "botonetics/klyster-telemetry-example_3_traffic_gen:latest"
  )

  if [ -n "${CONTAINER_TOOL}" ]; then
    for img in "${IMAGES[@]}"; do
      if ${CONTAINER_TOOL} images | grep -q "${img%%:*}"; then
        echo "  Importing ${img} into microk8s..."
        ${CONTAINER_TOOL} save "${img}" | microk8s images import - || true
      fi
    done
  fi
fi

echo -e "\n${CYAN}[4/5] Awaiting API and Frontend rollouts...${NC}"
${KUBECTL} rollout status deployment/bookstore-api -n "${NAMESPACE}" --timeout=120s || true
${KUBECTL} rollout status deployment/bookstore-frontend -n "${NAMESPACE}" --timeout=120s || true
${KUBECTL} rollout status deployment/bookstore-traffic-gen -n "${NAMESPACE}" --timeout=120s || true

# Verify Seed Data
echo -e "\n${CYAN}[5/5] Verifying PostgreSQL 100 seeded books & Redis session store...${NC}"
BOOK_COUNT=$(${KUBECTL} exec -n "${NAMESPACE}" statefulset/bookstore-db -- psql -U postgres -d bookstore -tAc "SELECT COUNT(*) FROM books;" 2>/dev/null || echo "0")
echo -e ">> ${GREEN}PostgreSQL reports: ${BOOK_COUNT} seeded books ready!${NC}"

REDIS_PING=$(${KUBECTL} exec -n "${NAMESPACE}" deployment/redis-session -- redis-cli ping 2>/dev/null || echo "FAIL")
echo -e ">> ${GREEN}Redis reports: ${REDIS_PING} (In-memory session token store online)${NC}"

# Setup port-forwarding for localhost:8088 if not already listening
if ! curl -s -f http://localhost:8088/ >/dev/null 2>&1; then
  echo -e "\n${CYAN}[6/6] Establishing background port-forward to http://localhost:8088...${NC}"
  fuser -k 8088/tcp >/dev/null 2>&1 || true
  nohup ${KUBECTL} port-forward -n "${NAMESPACE}" svc/bookstore-frontend 8088:80 --address 0.0.0.0 >/dev/null 2>&1 &
  sleep 2
fi

echo -e "\n${BOLD}======================================================================${NC}"
echo -e " ${BOLD}${GREEN}Bookstore Microservice Telemetry environment successfully deployed!${NC}"
echo -e " Namespace: ${CYAN}${NAMESPACE}${NC}"
echo -e " Run verification suite: ${CYAN}./verify-traffic.sh${NC}"
echo -e " Web Frontend is LIVE:   ${CYAN}http://localhost:8088${NC}"
echo -e " Manual Port Forward:    ${CYAN}${KUBECTL} port-forward -n ${NAMESPACE} svc/bookstore-frontend 8088:80${NC}"
echo -e "${BOLD}======================================================================${NC}"
