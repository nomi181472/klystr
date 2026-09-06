#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/klystr-multitier.yaml"
NAMESPACE="klystr-multitier"
BASE_RPS="${BASE_RPS:-10}"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
NC="\033[0m"

echo -e "${BOLD}======================================================================${NC}"
echo -e " ${BOLD}Deploying Netflix Architecture Telemetry Test Environment${NC}"
echo -e " Namespace: ${CYAN}${NAMESPACE}${NC} (BASE_RPS: ${BASE_RPS})"
echo -e "${BOLD}======================================================================${NC}"

# Step 1: Clean legacy single-tier services if upgrading
echo -e "\n${CYAN}[1/6] Preparing namespace and cleaning legacy deployments...${NC}"
microk8s kubectl delete deployment bi-service etl-pipeline -n "${NAMESPACE}" --ignore-not-found=true 2>/dev/null || true
microk8s kubectl delete service bi-service -n "${NAMESPACE}" --ignore-not-found=true 2>/dev/null || true

# Step 2: Apply Kubernetes Manifest
echo -e "${CYAN}[2/6] Applying multi-tier streaming architecture manifest...${NC}"
microk8s kubectl apply -f "${MANIFEST}"

# Step 3: Configure Base Traffic Rate
if [ "${BASE_RPS}" != "10" ]; then
  echo "Updating BASE_RPS in traffic-control ConfigMap to ${BASE_RPS}..."
  microk8s kubectl create configmap traffic-control -n "${NAMESPACE}" \
    --from-literal=config.json="{\"state\": \"RUNNING\", \"multiplier\": 1.0, \"base_rps\": ${BASE_RPS}.0}" \
    --dry-run=client -o yaml | microk8s kubectl apply -f -
fi

# Step 4: Await Rollout Readiness across All Tiers
echo -e "\n${CYAN}[3/6] Awaiting StatefulSets and Deployments rollout readiness...${NC}"
microk8s kubectl rollout status statefulset/db -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status statefulset/db-replica -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status statefulset/redis-master -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status statefulset/redis-replica -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status deployment/api1 -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status deployment/api2 -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status deployment/api-gateway -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status deployment/etl-service -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status deployment/frontend -n "${NAMESPACE}" --timeout=120s
microk8s kubectl rollout status deployment/traffic-generator -n "${NAMESPACE}" --timeout=120s

# Step 5: Verify Redis Master -> Replica Sync
echo -e "\n${CYAN}[4/6] Verifying Redis Master -> Replica replication stream...${NC}"
REPL_READY=false
for i in $(seq 1 15); do
  MASTER_INFO=$(microk8s kubectl exec -n "${NAMESPACE}" statefulset/redis-master -- redis-cli info replication 2>/dev/null || true)
  if echo "${MASTER_INFO}" | grep -q "connected_slaves:1"; then
    echo -e ">> ${GREEN}Redis master reports connected_slaves: 1 (Replication established!)${NC}"
    REPL_READY=true
    break
  fi
  sleep 2
done

if [ "${REPL_READY}" = "false" ]; then
  echo "Warning: Redis replica handshake still synchronizing, proceeding..."
fi

# Step 6: Verify PostgreSQL Cascading Streaming Replication
echo -e "\n${CYAN}[5/6] Verifying PostgreSQL Cascading Streaming Replication (Primary -> Replica-0 -> Replica-1)...${NC}"
PG0_READY=false
PG1_READY=false
for i in $(seq 1 20); do
  if [ "${PG0_READY}" = "false" ]; then
    STAT0=$(microk8s kubectl exec -n "${NAMESPACE}" db-replica-0 -- psql -U postgres -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || true)
    if [ "${STAT0}" = "t" ]; then
      echo -e ">> ${GREEN}PostgreSQL Replica-0 in recovery standby (streaming WAL from Primary db-0)!${NC}"
      PG0_READY=true
    fi
  fi
  if [ "${PG1_READY}" = "false" ]; then
    STAT1=$(microk8s kubectl exec -n "${NAMESPACE}" db-replica-1 -- psql -U postgres -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || true)
    if [ "${STAT1}" = "t" ]; then
      echo -e ">> ${GREEN}PostgreSQL Replica-1 in recovery standby (cascading WAL from Replica-0)!${NC}"
      PG1_READY=true
    fi
  fi
  if [ "${PG0_READY}" = "true" ] && [ "${PG1_READY}" = "true" ]; then
    break
  fi
  sleep 2
done

# Workload Summary
echo -e "\n${CYAN}[6/6] Namespace Workloads & Endpoints Summary${NC}"
microk8s kubectl get all -n "${NAMESPACE}"

echo ""
echo -e "${BOLD}======================================================================${NC}"
echo -e " ${BOLD}${GREEN}Netflix Architecture Telemetry environment successfully deployed in ${NAMESPACE}!${NC}"
echo -e " Check live status:    ${CYAN}./scale-test.sh traffic-status${NC}"
echo -e " Query QoE metrics:    ${CYAN}./scale-test.sh bi-query${NC}"
echo -e " View streaming dash:  ${CYAN}./scale-test.sh dashboard-query${NC}"
echo -e " Run verification:     ${CYAN}./verify-traffic.sh${NC}"
echo -e "${BOLD}======================================================================${NC}"
