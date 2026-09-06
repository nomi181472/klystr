#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="klystr-multitier"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
NC="\033[0m"

echo -e "${BOLD}======================================================================${NC}"
echo -e " ${BOLD}Tearing Down Netflix Architecture Telemetry Environment${NC}"
echo -e " Namespace: ${CYAN}${NAMESPACE}${NC}"
echo -e "${BOLD}======================================================================${NC}"

echo "Deleting namespace '${NAMESPACE}'..."
microk8s kubectl delete namespace "${NAMESPACE}" --ignore-not-found=true

echo "Waiting for namespace deletion to complete..."
microk8s kubectl wait --for=delete "namespace/${NAMESPACE}" --timeout=60s 2>/dev/null || true

echo ""
echo -e "${GREEN}Cleanup complete.${NC} Namespace '${NAMESPACE}' was completely removed."
echo "Cilium CNI, Klystr eBPF agents, kube-system, and other namespaces remain unaffected."
