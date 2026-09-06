#!/usr/bin/env bash
set -euo pipefail

echo "==========================================================="
echo " Cleaning up Klystr Network Traffic Test Environment"
echo "==========================================================="

echo "Deleting namespace 'klystr-test'..."
microk8s kubectl delete namespace klystr-test --ignore-not-found=true

echo "Cleanup complete. Cilium, Klystr, and other namespaces remain unaffected."
