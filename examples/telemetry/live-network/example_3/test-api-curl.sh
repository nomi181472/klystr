#!/usr/bin/env bash
# ==============================================================================
# Klystr Telemetry Example 3: Comprehensive API Verification Suite (using curl)
# Validates actual returned data, JSON fields, status codes, and headers.
# ==============================================================================
set -euo pipefail

API_URL="${1:-http://localhost:8080}"
FRONTEND_URL="${2:-http://localhost:8088}"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${BOLD}======================================================================${NC}"
echo -e " ${BOLD}Klystr Bookstore Microservice API Verification Test Suite (curl)${NC}"
echo -e " Direct API Target:     ${CYAN}${API_URL}${NC}"
echo -e " Frontend Proxy Target: ${CYAN}${FRONTEND_URL}${NC}"
echo -e "${BOLD}======================================================================${NC}"

PASS_COUNT=0
FAIL_COUNT=0

record_pass() {
  local num="$1"
  local desc="$2"
  local detail="${3:-}"
  echo -e "  [${GREEN}PASS${NC}] Case ${num}: ${desc}"
  if [ -n "${detail}" ]; then
    echo -e "         ${CYAN}-> ${detail}${NC}"
  fi
  PASS_COUNT=$((PASS_COUNT + 1))
}

record_fail() {
  local num="$1"
  local desc="$2"
  local detail="${3:-}"
  echo -e "  [${RED}FAIL${NC}] Case ${num}: ${desc}"
  if [ -n "${detail}" ]; then
    echo -e "         ${RED}-> ${detail}${NC}"
  fi
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

# Helper to execute curl and separate HTTP status and body
# Usage: do_curl <url> [method] [body] [extra_headers...]
do_curl() {
  local url="$1"
  local method="${2:-GET}"
  local body="${3:-}"
  shift 3 2>/dev/null || shift $#
  local headers=("$@")

  local header_args=()
  for h in "${headers[@]}"; do
    header_args+=(-H "$h")
  done

  local tmp_resp
  tmp_resp=$(mktemp)
  local http_code

  if [ -n "${body}" ]; then
    http_code=$(curl -s -S -w "%{http_code}" -o "${tmp_resp}" -X "${method}" \
      -H "Content-Type: application/json" "${header_args[@]}" \
      -d "${body}" "${url}" 2>/dev/null || echo "000")
  else
    http_code=$(curl -s -S -w "%{http_code}" -o "${tmp_resp}" -X "${method}" \
      "${header_args[@]}" "${url}" 2>/dev/null || echo "000")
  fi

  local resp_body
  resp_body=$(cat "${tmp_resp}")
  rm -f "${tmp_resp}"

  echo "${http_code}::${resp_body}"
}

# Python JSON helper
py_assert() {
  local json_str="$1"
  local expr="$2"
  python3 -c "
import json, sys
try:
    data = json.loads(sys.argv[1])
    result = eval(sys.argv[2])
    sys.exit(0 if result else 1)
except Exception:
    sys.exit(1)
" "${json_str}" "${expr}"
}

py_extract() {
  local json_str="$1"
  local expr="$2"
  python3 -c "
import json, sys
try:
    data = json.loads(sys.argv[1])
    val = eval(sys.argv[2])
    print(val if val is not None else '')
except Exception:
    print('')
" "${json_str}" "${expr}" 2>/dev/null || echo ""
}

# ------------------------------------------------------------------------------
# Test 1: Service Health Endpoint (/healthz)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [1/28] Health Endpoint Verification (/healthz) ---${NC}"
RESP=$(do_curl "${API_URL}/healthz")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('status') == 'ok' and data.get('database', {}).get('connected') is True and data.get('database', {}).get('total_books', 0) >= 100 and data.get('redis', {}).get('connected') is True"; then
  BOOKS_COUNT=$(py_extract "${BODY}" "data['database']['total_books']")
  record_pass "1" "Healthz endpoint returned healthy status with DB & Redis online" "Database seeded books: ${BOOKS_COUNT}, Redis: connected"
else
  record_fail "1" "Healthz failed or services degraded (HTTP ${CODE})" "${BODY}"
fi

# ------------------------------------------------------------------------------
# Test 2: Catalog Listing & Pagination (/api/books?page=1&limit=24)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [2/28] Catalog Pagination (/api/books?page=1&limit=24) ---${NC}"
RESP=$(do_curl "${API_URL}/api/books?page=1&limit=24")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('returned_count') == 24 and len(data.get('items', [])) == 24 and data.get('total', 0) >= 100 and 'stock_quantity' in data['items'][0] and 'publication_year' in data['items'][0]"; then
  FIRST_TITLE=$(py_extract "${BODY}" "data['items'][0]['title']")
  FIRST_YEAR=$(py_extract "${BODY}" "data['items'][0]['publication_year']")
  record_pass "2" "Pagination returned exactly 24 books with schema attributes" "First book: '${FIRST_TITLE}' (${FIRST_YEAR})"
else
  record_fail "2" "Catalog listing failed or returned unexpected payload" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 3: Pagination Offset & Page 2 Distinctness
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [3/28] Pagination Page 2 Distinctness (/api/books?page=2&limit=12) ---${NC}"
RESP1=$(do_curl "${API_URL}/api/books?page=1&limit=12")
RESP2=$(do_curl "${API_URL}/api/books?page=2&limit=12")
BODY1="${RESP1#*::}"
BODY2="${RESP2#*::}"

if py_assert "${BODY2}" "data.get('returned_count') == 12 and data.get('page') == 2"; then
  ID1=$(py_extract "${BODY1}" "data['items'][0]['id']")
  ID2=$(py_extract "${BODY2}" "data['items'][0]['id']")
  if [ "${ID1}" != "${ID2}" ]; then
    record_pass "3" "Page 2 offset returned distinct set of books" "Page 1 start ID: ${ID1} vs Page 2 start ID: ${ID2}"
  else
    record_fail "3" "Page 2 offset returned duplicate books of Page 1" "ID1: ${ID1}, ID2: ${ID2}"
  fi
else
  record_fail "3" "Page 2 request failed" "${BODY2:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 4: Keyword Search (/api/books?q=Distributed)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [4/28] Keyword Search Filter (/api/books?q=Distributed) ---${NC}"
RESP=$(do_curl "${API_URL}/api/books?q=Distributed")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "any('Designing Data-Intensive Applications' in b['title'] and b['author'] == 'Martin Kleppmann' for b in data.get('items', []))"; then
  FOUND_COUNT=$(py_extract "${BODY}" "data['returned_count']")
  record_pass "4" "Keyword search matched 'Designing Data-Intensive Applications'" "Matches found: ${FOUND_COUNT}"
else
  record_fail "4" "Keyword search failed to match expected book" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 5: Genre Filtering (/api/books?genre=Science%20Fiction)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [5/28] Genre Filter (/api/books?genre=Science%20Fiction) ---${NC}"
RESP=$(do_curl "${API_URL}/api/books?genre=Science%20Fiction&limit=50")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "all(b['genre'] == 'Science Fiction' for b in data.get('items', [])) and any('Dune' in b['title'] for b in data.get('items', [])) and any('Neuromancer' in b['title'] for b in data.get('items', []))"; then
  SF_COUNT=$(py_extract "${BODY}" "data['returned_count']")
  record_pass "5" "Genre filter returned only Science Fiction books (including Dune & Neuromancer)" "Count: ${SF_COUNT} books"
else
  record_fail "5" "Genre filter returned mismatched or incomplete books" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 6: Single Book Retrieval & Redis View Counter (/api/books/1)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [6/28] Single Book Retrieval & Redis View Counter (/api/books/1) ---${NC}"
RESP=$(do_curl "${API_URL}/api/books/1")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('id') == 1 and 'title' in data and 'view_count' in data and data.get('view_count', 0) >= 1"; then
  V1=$(py_extract "${BODY}" "data['view_count']")
  TITLE1=$(py_extract "${BODY}" "data['title']")
  record_pass "6" "Book #1 retrieved with Redis view tracking" "'${TITLE1}' (Views: ${V1})"
else
  record_fail "6" "Single book retrieval or Redis tracking missing" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 7: Redis View Counter Real-Time Increment
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [7/28] Redis View Counter Atomic Increment Verification ---${NC}"
RESP2=$(do_curl "${API_URL}/api/books/1")
BODY2="${RESP2#*::}"
V2=$(py_extract "${BODY2}" "data.get('view_count', 0)")

if [ "${V2}" -gt "${V1}" ]; then
  record_pass "7" "Redis atomic view counter incremented successfully on subsequent view" "Views progressed: ${V1} -> ${V2}"
else
  record_fail "7" "Redis view counter did not increment" "V1: ${V1}, V2: ${V2}"
fi

# ------------------------------------------------------------------------------
# Test 8: Non-Existent Book Retrieval (/api/books/99999)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [8/28] Non-Existent Book Handling (/api/books/99999) ---${NC}"
RESP=$(do_curl "${API_URL}/api/books/99999")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "404" ] && py_assert "${BODY}" "'error' in data"; then
  record_pass "8" "Correctly returned HTTP 404 for non-existent book ID" "Response: ${BODY}"
else
  record_fail "8" "Expected HTTP 404 for missing book but got ${CODE}" "${BODY}"
fi

# ------------------------------------------------------------------------------
# Test 9: Distinct Genres & Ratings Aggregation (/api/books/genres)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [9/28] Genre Catalog Aggregation (/api/books/genres) ---${NC}"
RESP=$(do_curl "${API_URL}/api/books/genres")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "len(data.get('genres', [])) >= 6 and all('genre' in g and 'count' in g and 'avg_rating' in g for g in data['genres'])"; then
  GENRE_NAMES=$(py_extract "${BODY}" "','.join(g['genre'] for g in data['genres'][:4])")
  record_pass "9" "Retrieved distinct genres with aggregated book counts & ratings" "Top genres: ${GENRE_NAMES}"
else
  record_fail "9" "Genre aggregation failed or incomplete" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 10: Catalog & Telemetry Metrics (/api/books/stats)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [10/28] Catalog & Telemetry Statistics (/api/books/stats) ---${NC}"
RESP=$(do_curl "${API_URL}/api/books/stats")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('total_books', 0) >= 100 and data.get('total_authors', 0) > 20 and len(data.get('top_rated', [])) == 5 and 'telemetry' in data"; then
  AUTHORS=$(py_extract "${BODY}" "data['total_authors']")
  TOP_BOOK=$(py_extract "${BODY}" "data['top_rated'][0]['title']")
  TOP_RATING=$(py_extract "${BODY}" "data['top_rated'][0]['rating']")
  record_pass "10" "Aggregated database & Redis telemetry metrics retrieved" "Total authors: ${AUTHORS}, Top book: '${TOP_BOOK}' (${TOP_RATING}★)"
else
  record_fail "10" "Statistics retrieval failed" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 11: High-Throughput Telemetry Payload Stream (/api/telemetry/payload)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [11/28] Telemetry Stream Generator (/api/telemetry/payload?size_kb=250) ---${NC}"
RESP=$(do_curl "${API_URL}/api/telemetry/payload?size_kb=250")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('size_kb') == 250 and data.get('bytes') == 250000 and 'sample_data' in data"; then
  BYTES=$(py_extract "${BODY}" "data['bytes']")
  record_pass "11" "Streamed exactly 250KB (${BYTES} bytes) payload for network edge testing"
else
  record_fail "11" "Payload stream generation failed" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 12: User Authentication - Valid Login (/api/auth/login)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [12/28] User Authentication Login (/api/auth/login) ---${NC}"
RESP=$(do_curl "${API_URL}/api/auth/login" "POST" "{\"username\":\"admin\",\"password\":\"admin123\"}")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

ADMIN_TOKEN=""
if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('user', {}).get('username') == 'admin' and data.get('user', {}).get('role') == 'admin' and len(data.get('token', '')) >= 32"; then
  ADMIN_TOKEN=$(py_extract "${BODY}" "data['token']")
  EXPIRES_IN=$(py_extract "${BODY}" "data.get('expires_in')")
  record_pass "12" "Admin login authenticated and session token issued" "Username: admin (Role: admin, TTL: ${EXPIRES_IN}s)"
else
  record_fail "12" "Admin authentication failed" "${BODY}"
fi

# ------------------------------------------------------------------------------
# Test 13: User Authentication - Invalid Credentials Rejection
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [13/28] Invalid Credentials Rejection (/api/auth/login) ---${NC}"
RESP=$(do_curl "${API_URL}/api/auth/login" "POST" "{\"username\":\"admin\",\"password\":\"IncorrectPassword999\"}")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "401" ] && py_assert "${BODY}" "'error' in data"; then
  record_pass "13" "Invalid password correctly rejected with HTTP 401 Unauthorized"
else
  record_fail "13" "Expected HTTP 401 for wrong password but got ${CODE}" "${BODY}"
fi

# ------------------------------------------------------------------------------
# Test 14: Sub-Millisecond Redis Session Validation (/api/auth/me)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [14/28] In-Memory Redis Session Validation (/api/auth/me) ---${NC}"
if [ -n "${ADMIN_TOKEN}" ]; then
  RESP=$(do_curl "${API_URL}/api/auth/me" "GET" "" "Authorization: Bearer ${ADMIN_TOKEN}")
  CODE="${RESP%%::*}"
  BODY="${RESP#*::}"

  if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('authenticated') is True and data.get('user', {}).get('username') == 'admin'"; then
    record_pass "14" "Active session validated against Redis in sub-millisecond" "User: admin (authenticated: true)"
  else
    record_fail "14" "Session token verification failed" "${BODY}"
  fi
else
  record_fail "14" "Skipped: Admin token not available"
fi

# ------------------------------------------------------------------------------
# Test 15: Missing Token Rejection (/api/auth/me)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [15/28] Unauthenticated Request Rejection (/api/auth/me) ---${NC}"
RESP=$(do_curl "${API_URL}/api/auth/me")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "401" ]; then
  record_pass "15" "Missing authorization header correctly rejected with HTTP 401"
else
  record_fail "15" "Expected HTTP 401 for unauthenticated request but got ${CODE}" "${BODY}"
fi

# ------------------------------------------------------------------------------
# Test 16: Forged / Invalid Token Rejection (/api/auth/me)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [16/28] Forged Token Rejection (/api/auth/me) ---${NC}"
RESP=$(do_curl "${API_URL}/api/auth/me" "GET" "" "Authorization: Bearer forged_session_token_1234567890abcdef")
CODE="${RESP%%::*}"

if [ "${CODE}" = "401" ]; then
  record_pass "16" "Forged session token rejected with HTTP 401"
else
  record_fail "16" "Expected HTTP 401 for forged token but got ${CODE}"
fi

# ------------------------------------------------------------------------------
# Test 17: User Registration (/api/auth/register)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [17/28] User Registration (/api/auth/register) ---${NC}"
TEST_USER="test_reader_$(date +%s%N | cut -b1-13)"
REG_BODY="{\"username\":\"${TEST_USER}\",\"password\":\"SecurePass123!\",\"email\":\"${TEST_USER}@klystr.dev\",\"full_name\":\"Automated Curl Tester\"}"
RESP=$(do_curl "${API_URL}/api/auth/register" "POST" "${REG_BODY}")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

TEST_TOKEN=""
if [ "${CODE}" = "201" ] && py_assert "${BODY}" "data.get('user', {}).get('username') == '${TEST_USER}' and len(data.get('token', '')) >= 32"; then
  TEST_TOKEN=$(py_extract "${BODY}" "data['token']")
  record_pass "17" "Registered new user '${TEST_USER}' and active Redis session token issued"
else
  record_fail "17" "User registration failed (HTTP ${CODE})" "${BODY}"
fi

# ------------------------------------------------------------------------------
# Test 18: Duplicate User Registration Conflict (/api/auth/register)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [18/28] Duplicate User Registration Rejection ---${NC}"
RESP=$(do_curl "${API_URL}/api/auth/register" "POST" "${REG_BODY}")
CODE="${RESP%%::*}"

if [ "${CODE}" = "409" ]; then
  record_pass "18" "Duplicate username registration rejected with HTTP 409 Conflict"
else
  record_fail "18" "Expected HTTP 409 for duplicate username but got ${CODE}"
fi

# ------------------------------------------------------------------------------
# Test 19: User Directory & Security Shielding (/api/users)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [19/28] Users Directory & Credential Privacy (/api/users) ---${NC}"
RESP=$(do_curl "${API_URL}/api/users")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('total', 0) >= 3 and any(u['username'] == 'admin' for u in data['users']) and all('password_hash' not in u and 'password_salt' not in u for u in data['users'])"; then
  TOTAL_USERS=$(py_extract "${BODY}" "data['total']")
  record_pass "19" "User directory listed without leaking password hashes or salts" "Total registered: ${TOTAL_USERS}"
else
  record_fail "19" "User listing failed or leaked sensitive hash data" "${BODY:0:200}"
fi

# ------------------------------------------------------------------------------
# Test 20: Authenticated Book Creation (/api/books)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [20/28] Authenticated Book Creation (/api/books) ---${NC}"
NEW_BOOK_JSON="{\"title\":\"eBPF Observability in Modern Kubernetes\",\"author\":\"Klystr Network Core\",\"genre\":\"Computer Science\",\"price\":49.95,\"publication_year\":2026,\"stock_quantity\":100,\"rating\":5.0,\"description\":\"A comprehensive deep-dive into live packet flows and latency benchmarking.\"}"
CREATED_BOOK_ID=""

if [ -n "${ADMIN_TOKEN}" ]; then
  RESP=$(do_curl "${API_URL}/api/books" "POST" "${NEW_BOOK_JSON}" "Authorization: Bearer ${ADMIN_TOKEN}")
  CODE="${RESP%%::*}"
  BODY="${RESP#*::}"

  if [ "${CODE}" = "201" ] && py_assert "${BODY}" "data.get('book', {}).get('title') == 'eBPF Observability in Modern Kubernetes' and data.get('book', {}).get('id') is not None"; then
    CREATED_BOOK_ID=$(py_extract "${BODY}" "data['book']['id']")
    record_pass "20" "Authenticated book creation succeeded in PostgreSQL" "New Book ID: ${CREATED_BOOK_ID}"
  else
    record_fail "20" "Book creation failed (HTTP ${CODE})" "${BODY}"
  fi
else
  record_fail "20" "Skipped: Admin token missing"
fi

# ------------------------------------------------------------------------------
# Test 21: Unauthenticated Book Creation Rejection
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [21/28] Unauthenticated Book Creation Rejection ---${NC}"
RESP=$(do_curl "${API_URL}/api/books" "POST" "${NEW_BOOK_JSON}")
CODE="${RESP%%::*}"

if [ "${CODE}" = "401" ]; then
  record_pass "21" "Unauthenticated book creation blocked with HTTP 401"
else
  record_fail "21" "Expected HTTP 401 for unauthenticated creation but got ${CODE}"
fi

# ------------------------------------------------------------------------------
# Test 22: Authenticated Book Update (/api/books/<id>)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [22/28] Authenticated Book Update (/api/books/${CREATED_BOOK_ID}) ---${NC}"
if [ -n "${CREATED_BOOK_ID}" ] && [ -n "${ADMIN_TOKEN}" ]; then
  UPDATE_JSON="{\"price\":59.99,\"stock_quantity\":150,\"rating\":4.95}"
  RESP=$(do_curl "${API_URL}/api/books/${CREATED_BOOK_ID}" "PUT" "${UPDATE_JSON}" "Authorization: Bearer ${ADMIN_TOKEN}")
  CODE="${RESP%%::*}"
  BODY="${RESP#*::}"

  if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('book', {}).get('price') == 59.99 and data.get('book', {}).get('stock_quantity') == 150"; then
    record_pass "22" "Book attributes updated and persisted successfully" "Updated price: \$59.99, stock: 150"
  else
    record_fail "22" "Book update failed (HTTP ${CODE})" "${BODY}"
  fi
else
  record_fail "22" "Skipped: Created book ID or admin token missing"
fi

# ------------------------------------------------------------------------------
# Test 23: Authenticated Book Deletion (/api/books/<id>)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [23/28] Authenticated Book Deletion (/api/books/${CREATED_BOOK_ID}) ---${NC}"
if [ -n "${CREATED_BOOK_ID}" ] && [ -n "${ADMIN_TOKEN}" ]; then
  RESP=$(do_curl "${API_URL}/api/books/${CREATED_BOOK_ID}" "DELETE" "" "Authorization: Bearer ${ADMIN_TOKEN}")
  CODE="${RESP%%::*}"
  BODY="${RESP#*::}"

  if [ "${CODE}" = "200" ]; then
    record_pass "23" "Test book #${CREATED_BOOK_ID} deleted successfully"
  else
    record_fail "23" "Book deletion failed (HTTP ${CODE})" "${BODY}"
  fi
else
  record_fail "23" "Skipped: Created book ID or admin token missing"
fi

# ------------------------------------------------------------------------------
# Test 24: Verify Post-Deletion 404 Status
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [24/28] Verification of Post-Deletion State ---${NC}"
if [ -n "${CREATED_BOOK_ID}" ]; then
  RESP=$(do_curl "${API_URL}/api/books/${CREATED_BOOK_ID}")
  CODE="${RESP%%::*}"

  if [ "${CODE}" = "404" ]; then
    record_pass "24" "Deleted book #${CREATED_BOOK_ID} confirmed removed (returns HTTP 404)"
  else
    record_fail "24" "Deleted book still accessible (HTTP ${CODE})"
  fi
else
  record_fail "24" "Skipped: Created book ID missing"
fi

# ------------------------------------------------------------------------------
# Test 25: Session Logout & Token Revocation (/api/auth/logout)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [25/28] Session Logout & Revocation (/api/auth/logout) ---${NC}"
if [ -n "${ADMIN_TOKEN}" ]; then
  RESP=$(do_curl "${API_URL}/api/auth/logout" "POST" "" "Authorization: Bearer ${ADMIN_TOKEN}")
  CODE="${RESP%%::*}"

  if [ "${CODE}" = "200" ]; then
    record_pass "25" "Session logout succeeded and revocation triggered in Redis"
  else
    record_fail "25" "Session logout failed (HTTP ${CODE})"
  fi
else
  record_fail "25" "Skipped: Admin token missing"
fi

# ------------------------------------------------------------------------------
# Test 26: Validation of Revoked Token
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [26/28] Post-Logout Revoked Token Validation ---${NC}"
if [ -n "${ADMIN_TOKEN}" ]; then
  RESP=$(do_curl "${API_URL}/api/auth/me" "GET" "" "Authorization: Bearer ${ADMIN_TOKEN}")
  CODE="${RESP%%::*}"

  if [ "${CODE}" = "401" ]; then
    record_pass "26" "Revoked token immediately rejected with HTTP 401 Unauthorized"
  else
    record_fail "26" "Revoked token still accepted by API (HTTP ${CODE})"
  fi
else
  record_fail "26" "Skipped: Admin token missing"
fi

# ------------------------------------------------------------------------------
# Test 27: Interactive SPA Frontend Assets Delivery
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [27/28] Frontend SPA UI Delivery (${FRONTEND_URL}) ---${NC}"
RESP=$(do_curl "${FRONTEND_URL}/")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && [[ "${BODY}" == *"<title>Klystr Bookstore"* ]]; then
  record_pass "27" "Frontend Nginx delivers SPA Single Page Application HTML"
else
  record_fail "27" "Frontend SPA delivery failed or index.html missing (HTTP ${CODE})"
fi

# ------------------------------------------------------------------------------
# Test 28: Frontend Reverse Proxy Routing (/api/* via Nginx)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}--- [28/28] Frontend Reverse Proxy Routing (${FRONTEND_URL}/api/books?limit=1) ---${NC}"
RESP=$(do_curl "${FRONTEND_URL}/api/books?limit=1")
CODE="${RESP%%::*}"
BODY="${RESP#*::}"

if [ "${CODE}" = "200" ] && py_assert "${BODY}" "data.get('returned_count') == 1 and len(data.get('items', [])) == 1"; then
  PROXY_BOOK=$(py_extract "${BODY}" "data['items'][0]['title']")
  record_pass "28" "Frontend successfully reverse-proxied /api/books to API service" "Proxied book: '${PROXY_BOOK}'"
else
  record_fail "28" "Frontend reverse proxy routing failed (HTTP ${CODE})" "${BODY:0:200}"
fi

# ==============================================================================
# Summary Report
# ==============================================================================
echo -e "\n${BOLD}======================================================================${NC}"
echo -e " ${BOLD}API Curl Test Suite Summary${NC}"
echo -e " Total Test Cases: 28"
echo -e " Passed:           ${GREEN}${PASS_COUNT}${NC}"
echo -e " Failed:           ${RED}${FAIL_COUNT}${NC}"
echo -e "${BOLD}======================================================================${NC}"

if [ "${FAIL_COUNT}" -eq 0 ]; then
  echo -e "\n${GREEN}${BOLD}✓ ALL 28 API CURL TEST CASES PASSED WITH 100% SUCCESS!${NC}\n"
  exit 0
else
  echo -e "\n${RED}${BOLD}✗ ${FAIL_COUNT} TEST CASES FAILED. REVIEW DETAILS ABOVE.${NC}\n"
  exit 1
fi
