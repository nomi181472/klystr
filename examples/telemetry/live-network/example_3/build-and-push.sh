#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

DOCKER_ORG="${DOCKER_ORG:-botonetics}"
TAG="${TAG:-latest}"

API_REPO="${DOCKER_ORG}/klyster-telemetry-example_3_api"
FRONTEND_REPO="${DOCKER_ORG}/klyster-telemetry-example_3_frontend"
TRAFFIC_REPO="${DOCKER_ORG}/klyster-telemetry-example_3_traffic_gen"

ACTION="${1:-all}"

echo -e "${BOLD}======================================================================${NC}"
echo -e " ${BOLD}Klystr Telemetry Example 3 - Docker Build & Push Pipeline${NC}"
echo -e " Target Registry:     ${CYAN}docker.io/${DOCKER_ORG}/*:${TAG}${NC}"
echo -e "${BOLD}======================================================================${NC}"

# Detect container runtime
if command -v podman >/dev/null 2>&1; then
  CONTAINER_BIN="podman"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_BIN="docker"
else
  echo -e "${RED}Error: Neither podman nor docker found in PATH.${NC}"
  exit 1
fi

do_build() {
  echo -e "\n${CYAN}[1/3] Building API Service Image (${API_REPO}:${TAG})...${NC}"
  ${CONTAINER_BIN} build -t "docker.io/${API_REPO}:${TAG}" -t "${API_REPO}:${TAG}" services/api

  echo -e "\n${CYAN}[2/3] Building Frontend SPA Service Image (${FRONTEND_REPO}:${TAG})...${NC}"
  ${CONTAINER_BIN} build -t "docker.io/${FRONTEND_REPO}:${TAG}" -t "${FRONTEND_REPO}:${TAG}" services/frontend

  echo -e "\n${CYAN}[3/3] Building Traffic Simulator Service Image (${TRAFFIC_REPO}:${TAG})...${NC}"
  ${CONTAINER_BIN} build -t "docker.io/${TRAFFIC_REPO}:${TAG}" -t "${TRAFFIC_REPO}:${TAG}" services/traffic-generator

  echo -e "\n>> ${GREEN}Successfully built and tagged all microservice images!${NC}"
  ${CONTAINER_BIN} images | grep "${DOCKER_ORG}/klyster-telemetry-example_3" || true
}

do_push() {
  echo -e "\n${CYAN}Pushing images to Docker Hub registry (docker.io)...${NC}"
  
  echo -e ">> Pushing ${CYAN}docker.io/${API_REPO}:${TAG}${NC}..."
  if ! ${CONTAINER_BIN} push "docker.io/${API_REPO}:${TAG}"; then
    echo -e "\n${YELLOW}[!] Push authentication required.${NC}"
    echo -e "To log in to your Docker Hub account, execute:"
    echo -e "   ${BOLD}${CONTAINER_BIN} login docker.io -u ${DOCKER_ORG}${NC}"
    echo -e "Then re-run: ${CYAN}./build-and-push.sh push${NC}\n"
    exit 1
  fi

  echo -e ">> Pushing ${CYAN}docker.io/${FRONTEND_REPO}:${TAG}${NC}..."
  ${CONTAINER_BIN} push "docker.io/${FRONTEND_REPO}:${TAG}" || true

  echo -e ">> Pushing ${CYAN}docker.io/${TRAFFIC_REPO}:${TAG}${NC}..."
  ${CONTAINER_BIN} push "docker.io/${TRAFFIC_REPO}:${TAG}" || true

  echo -e "\n${BOLD}${GREEN}All microservice container images successfully published to Docker Hub!${NC}"
}

case "${ACTION}" in
  build)
    do_build
    ;;
  push)
    do_push
    ;;
  all)
    do_build
    do_push
    ;;
  *)
    echo "Usage: $0 [build|push|all]"
    exit 1
    ;;
esac
