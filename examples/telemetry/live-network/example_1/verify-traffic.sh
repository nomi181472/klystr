#!/usr/bin/env bash
set -euo pipefail

echo "==========================================================="
echo " Verifying Live Traffic in 'klystr-test' Namespace"
echo "==========================================================="

NAMESPACE="klystr-test"

# Get any running traffic generator pod
GEN_POD=$(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

if [ -z "${GEN_POD}" ]; then
  echo "Error: No running traffic-generator pod found in namespace ${NAMESPACE}."
  echo "Make sure the environment is deployed with: ./deploy.sh"
  exit 1
fi

echo "Using traffic generator pod: ${GEN_POD}"
echo ""
echo "--- 1. Testing Single Request to backend-service ---"
microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- curl -s http://backend-service

echo ""
echo "--- 2. Demonstrating Load Balancing (20 consecutive requests) ---"
echo "Observing which backend replicas handle incoming traffic:"
for i in $(seq 1 20); do
  POD_RESP=$(microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- curl -s http://backend-service | grep "^Pod:" || echo "Pod: unknown")
  echo "Request #$i -> ${POD_RESP}"
done

echo ""
echo "--- 3. Testing Intentional Port 9999 Rejection (Failed Flow) ---"
echo "Sending request to backend-service:9999 (expecting connection refused / timeout):"
microk8s kubectl exec -n "${NAMESPACE}" "${GEN_POD}" -- curl -s -m 2 http://backend-service:9999 || echo ">> Flow successfully failed as expected (Connection refused/timeout recorded for Klystr observability)"

echo ""
echo "--- 4. Active Endpoints Distribution ---"
microk8s kubectl get endpoints backend-service -n "${NAMESPACE}"
