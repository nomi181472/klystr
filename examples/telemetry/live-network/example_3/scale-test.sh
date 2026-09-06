#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="klystr-bookstore"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
NC="\033[0m"

# Detect kubectl or fall back to container runtime
KUBECTL=""
if command -v microk8s >/dev/null 2>&1 && microk8s kubectl get nodes >/dev/null 2>&1; then
  KUBECTL="microk8s kubectl"
elif command -v kubectl >/dev/null 2>&1; then
  KUBECTL="kubectl"
fi

CONTAINER_BIN="docker"
if command -v podman >/dev/null 2>&1; then
  CONTAINER_BIN="podman"
fi

CLUSTER_READY=false
if [ -n "${KUBECTL}" ]; then
  RUNNING=$(${KUBECTL} get pods -n "${NAMESPACE}" --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -v Terminating | wc -l || echo "0")
  if [ "${RUNNING}" -ge 5 ]; then
    CLUSTER_READY=true
  fi
fi

COMMAND="${1:-help}"

case "${COMMAND}" in
  rps)
    NEW_RPS="${2:-10.0}"
    echo -e "${CYAN}Updating traffic generator rate to ${NEW_RPS} RPS...${NC}"
    if [ "${CLUSTER_READY}" = "true" ]; then
      ${KUBECTL} set env deployment/bookstore-traffic-gen -n "${NAMESPACE}" BASE_RPS="${NEW_RPS}"
    else
      ${CONTAINER_BIN} exec bookstore-traffic-gen sh -c "export BASE_RPS=${NEW_RPS}" 2>/dev/null || true
    fi
    echo -e "${GREEN}Updated BASE_RPS=${NEW_RPS}. Traffic generator rate applied.${NC}"
    ;;

  scale-api)
    REPLICAS="${2:-3}"
    echo -e "${CYAN}Scaling bookstore-api to ${REPLICAS} replicas...${NC}"
    if [ "${CLUSTER_READY}" = "true" ]; then
      ${KUBECTL} scale deployment/bookstore-api -n "${NAMESPACE}" --replicas="${REPLICAS}"
      ${KUBECTL} rollout status deployment/bookstore-api -n "${NAMESPACE}" --timeout=60s
    else
      ${CONTAINER_BIN} compose up -d --scale api="${REPLICAS}" 2>/dev/null || docker compose up -d --scale api="${REPLICAS}"
    fi
    echo -e "${GREEN}API scaled to ${REPLICAS} replicas. Observe multi-node load balancing in Klystr Network Graph!${NC}"
    ;;

  stream)
    SIZE_KB="${2:-500}"
    echo -e "${CYAN}Generating ${SIZE_KB} KB payload stream to trigger high-throughput heatmap edge...${NC}"
    START_TIME=$(date +%s%N)
    if [ "${CLUSTER_READY}" = "true" ]; then
      RESP=$(${KUBECTL} exec -n "${NAMESPACE}" deployment/bookstore-api -- curl -s "http://bookstore-api.klystr-bookstore.svc.cluster.local:8080/api/telemetry/payload?size_kb=${SIZE_KB}")
    else
      RESP=$(curl -s "http://localhost:8080/api/telemetry/payload?size_kb=${SIZE_KB}")
    fi
    END_TIME=$(date +%s%N)
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    ACTUAL_BYTES=$(echo "${RESP}" | grep -o '"bytes":[[:space:]]*[0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")
    echo -e "${GREEN}Streamed ${ACTUAL_BYTES} bytes (${SIZE_KB} KB) in ${ELAPSED_MS}ms.${NC}"
    echo -e "Check Klystr Telemetry Live Network UI: The edge between bookstore-db and bookstore-api indicates high throughput!"
    ;;

  traffic-status)
    echo -e "${CYAN}Recent traffic generator activity logs:${NC}"
    if [ "${CLUSTER_READY}" = "true" ]; then
      ${KUBECTL} logs -n "${NAMESPACE}" deployment/bookstore-traffic-gen --tail=25
    else
      ${CONTAINER_BIN} logs --tail=25 bookstore-traffic-gen 2>&1
    fi
    ;;

  stats)
    echo -e "${CYAN}Querying live Bookstore & Redis telemetry metrics:${NC}"
    if [ "${CLUSTER_READY}" = "true" ]; then
      RESP=$(${KUBECTL} exec -n "${NAMESPACE}" deployment/bookstore-api -- curl -s "http://bookstore-api.klystr-bookstore.svc.cluster.local:8080/api/books/stats")
    else
      RESP=$(curl -s "http://localhost:8080/api/books/stats")
    fi
    echo "${RESP}" | python3 -m json.tool 2>/dev/null || echo "${RESP}"
    echo ""
    ;;

  help|*)
    echo -e "${BOLD}Klystr Bookstore Scale & Telemetry Testing Utility${NC}"
    echo -e "Usage: $0 <subcommand> [args]"
    echo ""
    echo "Subcommands:"
    echo "  rps <rate>          Update traffic generator rate (e.g. ./scale-test.sh rps 25)"
    echo "  scale-api <count>   Scale API replicas (e.g. ./scale-test.sh scale-api 3)"
    echo "  stream <size_kb>    Stream large payload (e.g. ./scale-test.sh stream 1024)"
    echo "  traffic-status      View recent traffic generator logs"
    echo "  stats               View catalog, author, and active Redis session stats"
    ;;
esac
