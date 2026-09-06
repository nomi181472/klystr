#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="klystr-test"
ACTION="${1:-help}"

usage() {
  echo "Usage: $0 [scenario]"
  echo ""
  echo "Available scenarios:"
  echo "  scenario-1  : Scale to baseline (10 generators, 10 backends)"
  echo "  scenario-2  : Scale up traffic (20 generators, 20 backends)"
  echo "  scenario-3  : Asymmetric load (20 generators, 5 backends)"
  echo "  scenario-4  : Scale down backends (10 generators, 3 backends)"
  echo "  rollout     : Rolling restart of backend deployment"
  echo "  status      : View current replica and pod count"
  echo ""
}

case "${ACTION}" in
  scenario-1)
    echo ">> Scaling to Baseline: 10 traffic-generators, 10 backends..."
    microk8s kubectl scale deployment backend -n "${NAMESPACE}" --replicas=10
    microk8s kubectl scale deployment traffic-generator -n "${NAMESPACE}" --replicas=10
    ;;
  scenario-2)
    echo ">> Scaling Up: 20 traffic-generators, 20 backends..."
    microk8s kubectl scale deployment backend -n "${NAMESPACE}" --replicas=20
    microk8s kubectl scale deployment traffic-generator -n "${NAMESPACE}" --replicas=20
    ;;
  scenario-3)
    echo ">> Asymmetric Load: 20 traffic-generators hitting 5 backends..."
    microk8s kubectl scale deployment traffic-generator -n "${NAMESPACE}" --replicas=20
    microk8s kubectl scale deployment backend -n "${NAMESPACE}" --replicas=5
    ;;
  scenario-4)
    echo ">> Scaling Down: 10 traffic-generators hitting 3 backends..."
    microk8s kubectl scale deployment traffic-generator -n "${NAMESPACE}" --replicas=10
    microk8s kubectl scale deployment backend -n "${NAMESPACE}" --replicas=3
    ;;
  rollout)
    echo ">> Initiating rolling restart of backend deployment..."
    microk8s kubectl rollout restart deployment backend -n "${NAMESPACE}"
    microk8s kubectl rollout status deployment backend -n "${NAMESPACE}"
    ;;
  status)
    echo ">> Current deployments status in ${NAMESPACE}:"
    microk8s kubectl get deployments -n "${NAMESPACE}"
    echo ""
    echo ">> Current pod count:"
    echo "Backends: $(microk8s kubectl get pods -n "${NAMESPACE}" -l app=backend --no-headers | wc -l)"
    echo "Traffic Generators: $(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-generator --no-headers | wc -l)"
    echo "Traffic Debug: $(microk8s kubectl get pods -n "${NAMESPACE}" -l app=traffic-debug --no-headers | wc -l)"
    ;;
  *)
    usage
    exit 1
    ;;
esac
