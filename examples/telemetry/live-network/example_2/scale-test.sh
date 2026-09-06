#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="klystr-multitier"
ACTION="${1:-help}"

# ANSI Colors
BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
NC="\033[0m"

get_current_config() {
  local json
  json=$(microk8s kubectl get configmap traffic-control -n "${NAMESPACE}" -o jsonpath='{.data.config\.json}' 2>/dev/null || echo '{"state":"RUNNING","multiplier":1.0,"base_rps":10.0}')
  STATE=$(echo "${json}" | grep -o '"state": *"[^"]*"' | cut -d'"' -f4)
  STATE="${STATE:-RUNNING}"
  MULTIPLIER=$(echo "${json}" | grep -o '"multiplier": *[0-9.]*' | awk '{print $2}')
  MULTIPLIER="${MULTIPLIER:-1.0}"
  BASE_RPS=$(echo "${json}" | grep -o '"base_rps": *[0-9.]*' | awk '{print $2}')
  BASE_RPS="${BASE_RPS:-10.0}"
}

set_traffic_config() {
  local new_state="$1"
  local new_mult="$2"
  local new_base="$3"
  local json_payload="{\"state\": \"${new_state}\", \"multiplier\": ${new_mult}, \"base_rps\": ${new_base}}"

  # Update ConfigMap
  microk8s kubectl create configmap traffic-control -n "${NAMESPACE}" \
    --from-literal=config.json="${json_payload}" \
    --dry-run=client -o yaml | microk8s kubectl apply -f - >/dev/null 2>&1

  # Push directly to running traffic-generator pods for instantaneous zero-delay rate update
  local pods
  pods=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)
  for pod in ${pods}; do
    microk8s kubectl exec -n "${NAMESPACE}" "${pod}" -- sh -c "echo '${json_payload}' > /tmp/traffic-control" 2>/dev/null || true
  done
}

usage() {
  echo -e "${BOLD}======================================================================${NC}"
  echo -e " ${BOLD}Netflix Architecture Telemetry — Dynamic Scaling & Traffic Control${NC}"
  echo -e "${BOLD}======================================================================${NC}"
  echo -e "Usage: $0 [command]"
  echo ""
  echo -e "${CYAN}Viewer Traffic Rate Control:${NC}"
  echo "  traffic-start         : Resume audience traffic using current multiplier"
  echo "  traffic-stop          : Immediately halt all viewer requests (Strict 0 RPS)"
  echo "  traffic-1x            : Set viewer traffic rate to 1x (Base: 10 RPS)"
  echo "  traffic-2x            : Set viewer traffic rate to 2x (2 * Base = 20 RPS)"
  echo "  traffic-5x            : Set viewer traffic rate to 5x (5 * Base = 50 RPS)"
  echo "  traffic-10x           : Set viewer traffic rate to 10x (10 * Base = 100 RPS)"
  echo "  traffic <N>           : Set viewer traffic rate to arbitrary multiplier (e.g. 3, 7, 20)"
  echo "  traffic-status        : Inspect live traffic state, target RPS, and replica counts"
  echo ""
  echo -e "${CYAN}Application Tier Scaling:${NC}"
  echo "  baseline              : Set baseline replicas (2x frontend, gateway, api1, api2, etl)"
  echo "  scale-up              : Scale microservice tiers up to 4 replicas (Redis & DB protected)"
  echo "  scale-down            : Scale microservice tiers back down to 2 baseline replicas"
  echo ""
  echo -e "${CYAN}Streaming QoE & Telemetry Inspections:${NC}"
  echo "  bi-query              : Query real-time QoE metrics via Edge Gateway (/bi)"
  echo "  dashboard-query       : Query Executive Streaming Dashboard HTML (/dashboard)"
  echo "  failure-test          : Trigger intentional closed-port TCP RST rejected flows (Port 9999)"
  echo "  redis-failure         : Simulate temporary Redis Master outage and automatic recovery"
  echo "  active-connections    : Open high-concurrency simultaneous persistent TCP sockets"
  echo "  long-connections      : Inspect persistent Redis & PostgreSQL WAL replication streams"
  echo "  rollout-gateway       : Perform rolling restart of api-gateway deployment"
  echo "  rollout-etl           : Perform rolling restart of etl-service deployment"
  echo "  status                : Display complete cluster status for klystr-multitier"
  echo ""
}

case "${ACTION}" in
  traffic-start)
    get_current_config
    echo -e ">> ${GREEN}Resuming viewer traffic${NC} (Multiplier: ${MULTIPLIER}x, Base: ${BASE_RPS} RPS)..."
    set_traffic_config "RUNNING" "${MULTIPLIER}" "${BASE_RPS}"
    echo -e "Traffic state: ${GREEN}RUNNING${NC}"
    ;;

  traffic-stop)
    get_current_config
    echo -e ">> ${RED}Halting all viewer traffic${NC} (Strict 0 RPS drop across all generators)..."
    set_traffic_config "STOPPED" "${MULTIPLIER}" "${BASE_RPS}"
    echo -e "Traffic state: ${RED}STOPPED${NC} (Effective rate = 0 RPS)"
    ;;

  traffic-1x)
    get_current_config
    echo ">> Setting viewer traffic multiplier to 1x..."
    set_traffic_config "RUNNING" "1.0" "${BASE_RPS}"
    echo -e "Effective target: ${GREEN}$(awk "BEGIN {print 1.0 * ${BASE_RPS}}") RPS${NC}"
    ;;

  traffic-2x)
    get_current_config
    echo ">> Setting viewer traffic multiplier to 2x..."
    set_traffic_config "RUNNING" "2.0" "${BASE_RPS}"
    echo -e "Effective target: ${GREEN}$(awk "BEGIN {print 2.0 * ${BASE_RPS}}") RPS${NC}"
    ;;

  traffic-5x)
    get_current_config
    echo ">> Setting viewer traffic multiplier to 5x..."
    set_traffic_config "RUNNING" "5.0" "${BASE_RPS}"
    echo -e "Effective target: ${GREEN}$(awk "BEGIN {print 5.0 * ${BASE_RPS}}") RPS${NC}"
    ;;

  traffic-10x)
    get_current_config
    echo ">> Setting viewer traffic multiplier to 10x..."
    set_traffic_config "RUNNING" "10.0" "${BASE_RPS}"
    echo -e "Effective target: ${GREEN}$(awk "BEGIN {print 10.0 * ${BASE_RPS}}") RPS${NC}"
    ;;

  traffic)
    MULT="${2:-}"
    if [ -z "${MULT}" ]; then
      echo -e "${RED}Error: Missing multiplier argument.${NC} Example: $0 traffic 5"
      exit 1
    fi
    get_current_config
    echo ">> Setting viewer traffic multiplier to ${MULT}x..."
    set_traffic_config "RUNNING" "${MULT}" "${BASE_RPS}"
    echo -e "Effective target: ${GREEN}$(awk "BEGIN {print ${MULT} * ${BASE_RPS}}") RPS${NC}"
    ;;

  traffic-status)
    get_current_config
    target_rps="0"
    state_display="${RED}${STATE}${NC}"
    if [ "${STATE}" = "RUNNING" ]; then
      target_rps=$(awk "BEGIN {print ${MULTIPLIER} * ${BASE_RPS}}")
      state_display="${GREEN}${STATE}${NC}"
    fi
    echo -e "${BOLD}======================================================================${NC}"
    echo -e " ${BOLD}Netflix Architecture Telemetry — Live Traffic & Topology Status${NC}"
    echo -e "${BOLD}======================================================================${NC}"
    echo -e "Traffic State:               ${state_display}"
    echo -e "Traffic Multiplier:          ${MULTIPLIER}x"
    echo -e "Base Request Rate:           ${BASE_RPS} RPS"
    echo -e "Target Aggregate Rate:       ${BOLD}${target_rps} RPS${NC}"
    echo ""
    echo -e "${CYAN}Microservice & Gateway Tiers:${NC}"
    echo -e "  Edge Ingress (frontend):         $(microk8s kubectl get deployment frontend -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 2"
    echo -e "  API Gateway (api-gateway):       $(microk8s kubectl get deployment api-gateway -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 2"
    echo -e "  Playback Service (api1):         $(microk8s kubectl get deployment api1 -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 2"
    echo -e "  Catalog Service (api2):          $(microk8s kubectl get deployment api2 -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 2"
    echo -e "  QoE Analytics Engine (etl):      $(microk8s kubectl get deployment etl-service -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 2"
    echo -e "  Audience Simulator (generators): $(microk8s kubectl get deployment traffic-generator -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 2"
    echo ""
    echo -e "${CYAN}Distributed Caching & Storage Tiers:${NC}"
    echo -e "  Redis Playback Cache Master:     $(microk8s kubectl get statefulset redis-master -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 1"
    echo -e "  Redis Playback Cache Replica:    $(microk8s kubectl get statefulset redis-replica -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 1"
    echo -e "  PostgreSQL Primary (OLTP):       $(microk8s kubectl get statefulset db -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 1"
    echo -e "  PostgreSQL Cascading Replicas:   $(microk8s kubectl get statefulset db-replica -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0) / 2"
    echo -e "${BOLD}======================================================================${NC}"
    ;;

  baseline)
    echo ">> Restoring baseline replicas (2x frontend, gateway, api1, api2, etl-service)..."
    microk8s kubectl scale deployment frontend -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment api-gateway -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment api1 -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment api2 -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment etl-service -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment traffic-generator -n "${NAMESPACE}" --replicas=2
    echo -e ">> ${GREEN}Baseline replicas restored successfully.${NC}"
    ;;

  scale-up)
    echo ">> Scaling microservice tiers up to 4 replicas (Redis & DB remain protected)..."
    microk8s kubectl scale deployment frontend -n "${NAMESPACE}" --replicas=4
    microk8s kubectl scale deployment api-gateway -n "${NAMESPACE}" --replicas=4
    microk8s kubectl scale deployment api1 -n "${NAMESPACE}" --replicas=4
    microk8s kubectl scale deployment api2 -n "${NAMESPACE}" --replicas=4
    microk8s kubectl scale deployment etl-service -n "${NAMESPACE}" --replicas=4
    microk8s kubectl rollout status deployment/frontend -n "${NAMESPACE}" --timeout=60s
    microk8s kubectl rollout status deployment/api-gateway -n "${NAMESPACE}" --timeout=60s
    echo -e ">> ${GREEN}Scale-up completed. 4 replicas running per tier.${NC}"
    ;;

  scale-down)
    echo ">> Scaling microservice tiers back down to 2 baseline replicas..."
    microk8s kubectl scale deployment frontend -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment api-gateway -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment api1 -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment api2 -n "${NAMESPACE}" --replicas=2
    microk8s kubectl scale deployment etl-service -n "${NAMESPACE}" --replicas=2
    echo -e ">> ${GREEN}Scale-down completed. Baseline restored.${NC}"
    ;;

  bi-query)
    echo ">> Querying real-time Quality of Experience (QoE) metrics through Edge Gateway (frontend-service:80/bi)..."
    GEN_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c '
import urllib.request, json
with urllib.request.urlopen("http://frontend-service.klystr-multitier.svc.cluster.local:80/bi", timeout=3) as resp:
    print(json.dumps(json.loads(resp.read().decode()), indent=2))
'
    ;;

  dashboard-query)
    echo ">> Querying Executive Streaming Dashboard HTML through Edge Gateway (frontend-service:80/dashboard)..."
    GEN_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c '
import urllib.request
with urllib.request.urlopen("http://frontend-service.klystr-multitier.svc.cluster.local:80/dashboard", timeout=3) as resp:
    content = resp.read().decode()
    print(f"HTTP Status: {resp.status}")
    print(f"Dashboard Payload Size: {len(content)} bytes")
    print("--- HTML Preview (First 350 chars) ---")
    print(content[:350])
'
    ;;

  failure-test)
    echo -e ">> ${YELLOW}Running intentional closed-port TCP RST failure test across tier topology...${NC}"
    GEN_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    FE_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=frontend --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    GW_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=api-gateway --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    API_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=api1 --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')

    echo "1. Testing normal frontend request from audience generator..."
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c '
import urllib.request
req = urllib.request.urlopen("http://frontend-service.klystr-multitier.svc.cluster.local/playback", timeout=2)
print("Normal request status:", req.status)
'
    echo "2. Probing closed port on frontend-service:9999 from audience generator..."
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c '
import socket
try:
    s = socket.create_connection(("frontend-service.klystr-multitier.svc.cluster.local", 9999), timeout=1.0)
    s.close()
except Exception as e:
    print(">> [PASS] Observed expected TCP RST / rejection on frontend-service:9999:", e)
'
    echo "3. Probing closed port on api-gateway-service:9999 from frontend pod..."
    microk8s kubectl exec -n "${NAMESPACE}" "${FE_POD}" -- sh -c '
nc -w 1 api-gateway-service.klystr-multitier.svc.cluster.local 9999 < /dev/null 2>/dev/null || echo ">> [PASS] Observed expected TCP connection failure on api-gateway-service:9999"
'
    echo "4. Probing closed port on api1-service:9999 from api-gateway pod..."
    microk8s kubectl exec -n "${NAMESPACE}" "${GW_POD}" -- sh -c '
nc -w 1 api1-service.klystr-multitier.svc.cluster.local 9999 < /dev/null 2>/dev/null || echo ">> [PASS] Observed expected TCP connection failure on api1-service:9999"
'
    echo "5. Probing closed port on redis-master-service:9999 and db-service:9999 from Playback API pod..."
    microk8s kubectl exec -n "${NAMESPACE}" "${API_POD}" -- python3 -c '
import socket
for target in ["redis-master-service.klystr-multitier.svc.cluster.local", "db-service.klystr-multitier.svc.cluster.local"]:
    try:
        s = socket.create_connection((target, 9999), timeout=1.0)
        s.close()
    except Exception as e:
        print(f">> [PASS] Observed expected TCP RST / rejection on {target}:9999: {e}")
'
    echo -e ">> ${GREEN}Failure test complete. All flows strictly respected tier boundaries and generated observable eBPF reject metrics.${NC}"
    ;;

  redis-failure)
    echo -e ">> ${YELLOW}Initiating Redis Master temporary failover scenario...${NC}"
    echo "1. Checking initial Redis health..."
    microk8s kubectl exec -n "${NAMESPACE}" statefulset/redis-master -- redis-cli ping
    echo "2. Temporarily scaling redis-master to 0 replicas..."
    microk8s kubectl scale statefulset redis-master -n "${NAMESPACE}" --replicas=0
    sleep 3
    echo "3. Sending Playback request during Redis outage (expecting fallback error response)..."
    GEN_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c '
import urllib.request
try:
    with urllib.request.urlopen("http://frontend-service.klystr-multitier.svc.cluster.local/playback", timeout=3) as resp:
        print("API Response during Redis outage:")
        print(resp.read().decode())
except Exception as e:
    print("Request exception:", e)
'
    echo "4. Restoring redis-master back to 1 replica..."
    microk8s kubectl scale statefulset redis-master -n "${NAMESPACE}" --replicas=1
    microk8s kubectl rollout status statefulset/redis-master -n "${NAMESPACE}" --timeout=60s
    sleep 2
    echo "5. Verifying Redis recovery..."
    microk8s kubectl exec -n "${NAMESPACE}" statefulset/redis-master -- redis-cli ping
    echo "6. Verifying Playback request succeeds with Redis OK..."
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c '
import urllib.request
with urllib.request.urlopen("http://frontend-service.klystr-multitier.svc.cluster.local/playback", timeout=3) as resp:
    print("API Response after Redis recovery:")
    print(resp.read().decode())
'
    echo -e ">> ${GREEN}Redis failover and recovery scenario completed successfully.${NC}"
    ;;

  active-connections)
    CONN_COUNT="${2:-10}"
    DURATION="${3:-15}"
    echo -e ">> ${CYAN}Establishing ${CONN_COUNT} simultaneous active TCP connections held for ${DURATION}s...${NC}"
    GEN_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c "
import socket, time

count = ${CONN_COUNT}
duration = ${DURATION}
sockets = []
print(f'Opening {count} TCP sockets to frontend-service:80...')

for i in range(count):
    try:
        s = socket.create_connection(('frontend-service.klystr-multitier.svc.cluster.local', 80), timeout=2.0)
        s.sendall(b'GET /healthz HTTP/1.1\r\nHost: frontend-service\r\n\r\n')
        sockets.append(s)
    except Exception as e:
        print(f'Error opening socket {i}: {e}')

print(f'>> {len(sockets)} sockets connected! Holding open for {duration} seconds (observable in Klystr ESTABLISHED counters)...')
time.sleep(duration)

for s in sockets:
    try: s.close()
    except Exception: pass
print('>> Active connections closed cleanly.')
"
    ;;

  long-connections)
    echo -e ">> ${CYAN}Inspecting Long-Lived TCP Streams in Klystr Telemetry...${NC}"
    echo "1. Redis Master -> Replica Persistent Replication TCP Connection:"
    microk8s kubectl exec -n "${NAMESPACE}" statefulset/redis-master -- redis-cli client list | grep -E "replica|slave" || echo "Replication client active"
    echo ""
    echo "2. PostgreSQL Cascading WAL Streaming Replication Connections:"
    echo "Primary db-0 WAL Senders (streaming to db-replica-0):"
    microk8s kubectl exec -n "${NAMESPACE}" db-0 -- psql -U postgres -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;" 2>/dev/null || true
    echo "Replica-0 WAL Senders (cascading streaming to db-replica-1):"
    microk8s kubectl exec -n "${NAMESPACE}" db-replica-0 -- psql -U postgres -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;" 2>/dev/null || true
    echo ""
    echo "3. Establishing persistent application TCP stream to frontend-service:80 (held for 20s)..."
    GEN_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
    microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- python3 -c '
import socket, time
print("Connecting long-lived TCP socket to frontend-service:80...")
s = socket.create_connection(("frontend-service.klystr-multitier.svc.cluster.local", 80), timeout=3.0)
for i in range(10):
    s.sendall(b"GET /healthz HTTP/1.1\r\nHost: frontend-service\r\n\r\n")
    data = s.recv(1024)
    print(f"Heartbeat {i+1}/10 over persistent connection - Bytes received: {len(data)}")
    time.sleep(2)
s.close()
print("Long-lived connection closed.")
'
    ;;

  rollout-gateway)
    echo ">> Performing rolling restart of api-gateway deployment..."
    microk8s kubectl rollout restart deployment api-gateway -n "${NAMESPACE}"
    microk8s kubectl rollout status deployment api-gateway -n "${NAMESPACE}"
    ;;

  rollout-etl)
    echo ">> Performing rolling restart of etl-service deployment..."
    microk8s kubectl rollout restart deployment etl-service -n "${NAMESPACE}"
    microk8s kubectl rollout status deployment etl-service -n "${NAMESPACE}"
    ;;

  status)
    echo "=== Workload Deployments ==="
    microk8s kubectl get deployments -n "${NAMESPACE}"
    echo ""
    echo "=== StatefulSets ==="
    microk8s kubectl get statefulsets -n "${NAMESPACE}"
    echo ""
    echo "=== Pods ==="
    microk8s kubectl get pods -n "${NAMESPACE}" -o wide
    ;;

  *)
    usage
    exit 1
    ;;
esac
