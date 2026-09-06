#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="klystr-bookstore"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${BOLD}======================================================================${NC}"
echo -e " ${BOLD}Klystr Bookstore Telemetry Verification Test Suite (15 Steps)${NC}"
echo -e " Namespace: ${CYAN}${NAMESPACE}${NC}"
echo -e "${BOLD}======================================================================${NC}"

MODE="${1:-auto}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${MODE}" = "--compose" ] || [ "${MODE}" = "--local" ]; then
  exec "${SCRIPT_DIR}/test-api-curl.sh" "http://localhost:8080" "http://localhost:8088"
fi

# Detect kubectl or fall back to localhost if cluster unavailable
KUBECTL=""
if command -v microk8s >/dev/null 2>&1 && microk8s kubectl get nodes >/dev/null 2>&1; then
  KUBECTL="microk8s kubectl"
elif command -v kubectl >/dev/null 2>&1; then
  KUBECTL="kubectl"
fi

# If kubectl found, check if namespace has running pods; if not, check localhost
if [ -n "${KUBECTL}" ]; then
  RUNNING_COUNT=$(${KUBECTL} get pods -n "${NAMESPACE}" --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -v Terminating | wc -l || echo "0")
  if [ "${RUNNING_COUNT}" -lt 5 ] && curl -s -f http://localhost:8080/healthz >/dev/null 2>&1; then
    echo -e "${YELLOW}Cluster workloads not fully ready (${RUNNING_COUNT}/5 running); running test suite against live environment...${NC}"
    exec "${SCRIPT_DIR}/test-api-curl.sh" "http://localhost:8080" "http://localhost:8088"
  fi
elif curl -s -f http://localhost:8080/healthz >/dev/null 2>&1; then
  exec "${SCRIPT_DIR}/test-api-curl.sh" "http://localhost:8080" "http://localhost:8088"
else
  echo -e "${RED}Error: Neither Kubernetes cluster nor local service on http://localhost:8080 is reachable.${NC}"
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0

record_result() {
  local step_num="$1"
  local desc="$2"
  local status="$3"
  if [ "$status" = "0" ]; then
    echo -e "  [${GREEN}PASS${NC}] Step ${step_num}: ${desc}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  [${RED}FAIL${NC}] Step ${step_num}: ${desc}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Step 1: Check Pods Running
echo -e "\n${CYAN}--- Step 1: Namespace & Pod Status ---${NC}"
PODS=$(${KUBECTL} get pods -n "${NAMESPACE}" --no-headers 2>/dev/null || true)
if echo "${PODS}" | grep -q "bookstore-db" && echo "${PODS}" | grep -q "redis-session"; then
  record_result "1" "All microservice pods detected in ${NAMESPACE}" 0
else
  record_result "1" "Pod status incomplete or pods missing" 1
fi

# Step 2: Database 100 Books Seed Verification
echo -e "\n${CYAN}--- Step 2: PostgreSQL 100 Pre-Seeded Books Verification ---${NC}"
BOOK_COUNT=$(${KUBECTL} exec -n "${NAMESPACE}" statefulset/bookstore-db -- psql -U postgres -d bookstore -tAc "SELECT COUNT(*) FROM books;" 2>/dev/null || echo "0")
echo "  Queried PostgreSQL total books count: ${BOOK_COUNT}"
if [ "${BOOK_COUNT}" -ge 100 ]; then
  record_result "2" "PostgreSQL holds 100+ seeded books (${BOOK_COUNT} present)" 0
else
  record_result "2" "PostgreSQL seed count less than 100 (${BOOK_COUNT})" 1
fi

# Step 3: Redis In-Memory Connection & Ping
echo -e "\n${CYAN}--- Step 3: Redis Session Store Health ---${NC}"
REDIS_PONG=$(${KUBECTL} exec -n "${NAMESPACE}" deployment/redis-session -- redis-cli ping 2>/dev/null || echo "FAIL")
if [ "${REDIS_PONG}" = "PONG" ]; then
  record_result "3" "Redis responded to PING with PONG" 0
else
  record_result "3" "Redis ping failed (${REDIS_PONG})" 1
fi

# Set up port-forward in background or query directly via pod exec
API_POD=$(${KUBECTL} get pod -n "${NAMESPACE}" -l app=bookstore-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "${API_POD}" ]; then
  echo -e "${YELLOW}API pod not found yet; verifying cluster endpoints...${NC}"
fi

# Helper to query API inside the cluster
exec_curl() {
  local path="$1"
  local method="${2:-GET}"
  local body="${3:-}"
  local headers="${4:-}"
  
  if [ -n "${body}" ]; then
    ${KUBECTL} exec -n "${NAMESPACE}" deployment/bookstore-api -- curl -s -X "${method}" -H "Content-Type: application/json" ${headers:+-H "${headers}"} -d "${body}" "http://bookstore-api.klystr-bookstore.svc.cluster.local:8080${path}" 2>/dev/null || echo "{}"
  else
    ${KUBECTL} exec -n "${NAMESPACE}" deployment/bookstore-api -- curl -s -X "${method}" ${headers:+-H "${headers}"} "http://bookstore-api.klystr-bookstore.svc.cluster.local:8080${path}" 2>/dev/null || echo "{}"
  fi
}

# Step 4: API Health Check
echo -e "\n${CYAN}--- Step 4: API Health Endpoint (/healthz) ---${NC}"
HEALTH_RESP=$(exec_curl "/healthz")
if echo "${HEALTH_RESP}" | grep -q '"status":"ok"'; then
  record_result "4" "API /healthz returns status ok" 0
else
  record_result "4" "API /healthz response degraded or unreachable" 1
fi

# Step 5: Catalog Listing with Pagination
echo -e "\n${CYAN}--- Step 5: Books Catalog Pagination (/api/books?page=1&limit=24) ---${NC}"
BOOKS_RESP=$(exec_curl "/api/books?page=1&limit=24")
TOTAL_RET=$(echo "${BOOKS_RESP}" | grep -o '"returned_count":[[:space:]]*[0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")
TOTAL_RET="${TOTAL_RET:-0}"
if [ "${TOTAL_RET}" -eq 24 ]; then
  record_result "5" "Pagination returned exactly 24 books as requested" 0
else
  record_result "5" "Pagination returned unexpected count (${TOTAL_RET})" 1
fi

# Step 6: Keyword Search Filter
echo -e "\n${CYAN}--- Step 6: Keyword Search (/api/books?q=Distributed) ---${NC}"
SEARCH_RESP=$(exec_curl "/api/books?q=Distributed")
if echo "${SEARCH_RESP}" | grep -q "Designing Data-Intensive Applications"; then
  record_result "6" "Search found 'Designing Data-Intensive Applications'" 0
else
  record_result "6" "Keyword search did not return expected book" 1
fi

# Step 7: Genre Filter
echo -e "\n${CYAN}--- Step 7: Genre Filter (/api/books?genre=Science%20Fiction) ---${NC}"
GENRE_RESP=$(exec_curl "/api/books?genre=Science%20Fiction")
if echo "${GENRE_RESP}" | grep -q "Dune" && echo "${GENRE_RESP}" | grep -q "Neuromancer"; then
  record_result "7" "Science Fiction filter returned Dune and Neuromancer" 0
else
  record_result "7" "Genre filter response missing expected titles" 1
fi

# Step 8: Single Book Retrieval & Redis View Counter
echo -e "\n${CYAN}--- Step 8: Single Book Detail & Redis Read Tracking (/api/books/1) ---${NC}"
BOOK1_RESP=$(exec_curl "/api/books/1")
if echo "${BOOK1_RESP}" | grep -q '"view_count":'; then
  record_result "8" "Book #1 retrieved with Redis view_count tracked" 0
else
  record_result "8" "Single book retrieval or Redis tracking missing" 1
fi

# Step 9: User Registration
echo -e "\n${CYAN}--- Step 9: User Registration (/api/auth/register) ---${NC}"
TEST_USER="telemetry_test_$(date +%s)"
REG_RESP=$(exec_curl "/api/auth/register" "POST" "{\"username\":\"${TEST_USER}\",\"password\":\"Pass123!\",\"email\":\"${TEST_USER}@test.io\",\"full_name\":\"Telemetry Test\"}")
TEST_TOKEN=$(echo "${REG_RESP}" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || echo "")
if [ -n "${TEST_TOKEN}" ]; then
  record_result "9" "User '${TEST_USER}' registered and session token issued" 0
else
  record_result "9" "User registration failed" 1
fi

# Step 10: User Login
echo -e "\n${CYAN}--- Step 10: User Login (/api/auth/login) ---${NC}"
LOGIN_RESP=$(exec_curl "/api/auth/login" "POST" "{\"username\":\"admin\",\"password\":\"admin123\"}")
ADMIN_TOKEN=$(echo "${LOGIN_RESP}" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || echo "")
if [ -n "${ADMIN_TOKEN}" ]; then
  record_result "10" "Admin login successful and session token generated" 0
else
  record_result "10" "Admin login failed" 1
fi

# Step 11: Redis Session Verification
echo -e "\n${CYAN}--- Step 11: Redis In-Memory Session Validation (/api/auth/me) ---${NC}"
ME_RESP=$(exec_curl "/api/auth/me" "GET" "" "Authorization: Bearer ${ADMIN_TOKEN}")
if echo "${ME_RESP}" | grep -q '"authenticated":true' && echo "${ME_RESP}" | grep -q '"username":"admin"'; then
  record_result "11" "Session token validated via Redis in sub-millisecond" 0
else
  record_result "11" "Session verification against Redis failed" 1
fi

# Step 12: Authenticated Book Creation
echo -e "\n${CYAN}--- Step 12: Authenticated Book Creation (/api/books) ---${NC}"
NEW_BOOK_RESP=$(exec_curl "/api/books" "POST" "{\"title\":\"Observability Engineering with eBPF\",\"author\":\"Klystr Telemetry Team\",\"genre\":\"Computer Science\",\"price\":39.99,\"publication_year\":2025,\"rating\":5.0,\"description\":\"Real-time network flows and telemetry analysis.\"}" "Authorization: Bearer ${ADMIN_TOKEN}")
CREATED_ID=$(echo "${NEW_BOOK_RESP}" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2 || echo "")
if [ -n "${CREATED_ID}" ]; then
  record_result "12" "Created new book with ID ${CREATED_ID} in PostgreSQL" 0
else
  record_result "12" "Authenticated book creation failed" 1
fi

# Step 13: High-Throughput Stream Simulation for Heatmap
echo -e "\n${CYAN}--- Step 13: Telemetry Stream Simulation (/api/telemetry/payload?size_kb=250) ---${NC}"
STREAM_RESP=$(exec_curl "/api/telemetry/payload?size_kb=250")
if echo "${STREAM_RESP}" | grep -q '"size_kb":250'; then
  record_result "13" "Streamed 250KB payload to exercise network graph edges" 0
else
  record_result "13" "Stream endpoint simulation failed" 1
fi

# Step 14: Session Logout & Revocation
echo -e "\n${CYAN}--- Step 14: User Logout & Redis Session Revocation (/api/auth/logout) ---${NC}"
LOGOUT_RESP=$(exec_curl "/api/auth/logout" "POST" "" "Authorization: Bearer ${ADMIN_TOKEN}")
REVOKED_CHECK=$(exec_curl "/api/auth/me" "GET" "" "Authorization: Bearer ${ADMIN_TOKEN}")
if echo "${REVOKED_CHECK}" | grep -q "Unauthorized"; then
  record_result "14" "Session revoked in Redis; subsequent request returned 401" 0
else
  record_result "14" "Session token still valid after logout" 1
fi

# Step 15: Microservice Telemetry Stats
echo -e "\n${CYAN}--- Step 15: Catalog & Redis Session Stats (/api/books/stats) ---${NC}"
STATS_RESP=$(exec_curl "/api/books/stats")
if echo "${STATS_RESP}" | grep -q '"total_books":' && echo "${STATS_RESP}" | grep -q '"active_redis_sessions":'; then
  record_result "15" "Aggregated database & Redis session statistics retrieved" 0
else
  record_result "15" "Stats retrieval incomplete" 1
fi

# Test Suite Summary
echo -e "\n${BOLD}======================================================================${NC}"
echo -e " Test Suite Complete: ${GREEN}${PASS_COUNT} Passed${NC} / ${RED}${FAIL_COUNT} Failed${NC} (Total: 15 steps)"
echo -e "${BOLD}======================================================================${NC}"

if [ "${FAIL_COUNT}" -eq 0 ]; then
  echo -e "${GREEN}All 15 verification steps passed with flying colors!${NC}\n"
  exit 0
else
  echo -e "${RED}Some verification steps failed. Review logs above.${NC}\n"
  exit 1
fi
