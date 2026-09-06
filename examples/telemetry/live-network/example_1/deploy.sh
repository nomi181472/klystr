#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/klystr-test.yaml"

echo "==========================================================="
echo " Deploying Klystr Network Traffic Test Environment"
echo "==========================================================="

microk8s kubectl apply -f "${MANIFEST}"

echo ""
echo "Waiting for deployments to roll out in namespace 'klystr-test'..."
microk8s kubectl rollout status deployment/backend -n klystr-test --timeout=120s
microk8s kubectl rollout status deployment/traffic-generator -n klystr-test --timeout=120s
microk8s kubectl rollout status deployment/traffic-debug -n klystr-test --timeout=120s

echo ""
echo "=== Namespace Workloads Summary ==="
microk8s kubectl get all -n klystr-test

echo ""
echo "=== Backend Service Endpoints ==="
microk8s kubectl get endpoints backend-service -n klystr-test -o wide
