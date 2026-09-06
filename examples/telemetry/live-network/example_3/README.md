# Klystr Telemetry Example 3: Full-Stack Microservice Bookstore Architecture

A production-grade, multi-tier microservice application designed to demonstrate and benchmark **Klystr Live Network Telemetry** (throughput heatmaps, packet rates, active TCP connections, TCP retransmissions, and RTT latency).

---

## 1. Architecture Overview

```
                      +-----------------------------+
                      |   Traffic Generator Pod     |
                      | (Continuous user simulator) |
                      +--------------+--------------+
                                     | (HTTP REST)
                                     v
                      +-----------------------------+
                      |   Interactive SPA Frontend  |
                      |  (Nginx 1.25 Alpine / Port 80)
                      +--------------+--------------+
                                     | (Reverse Proxy /api/*)
                                     v
                      +-----------------------------+
                      |     Bookstore REST API      |
                      |   (Python 3.11 / Port 8080) |
                      +-------+--------------+------+
                              |              |
           (SQL Queries / TCP)|              | (Session Tokens / TTL)
                              v              v
         +-----------------------+     +-----------------------+
         |     PostgreSQL 16     |     |        Redis 7        |
         |  100 Pre-Seeded Books |     | In-Memory Session     |
         |  & User Accounts      |     | Token Store           |
         +-----------------------+     +-----------------------+
```

### Key Components

1. **PostgreSQL 16 Database (`bookstore-db`)**:
   - Pre-seeded with **100 realistic books** spanning 6 specialized genres (Computer Science, Science Fiction, Classic Literature, Mystery & Thriller, Philosophy, Business & Economics).
   - Stores users, credentials (salted SHA-256), book catalog, inventory stock, and timestamps.
2. **Redis 7 Session Store (`redis-session`)**:
   - Manages authentication tokens (`session:<token>`) with automatic TTL expiration (3600s).
   - Provides sub-millisecond session validation for incoming requests.
   - Tracks live view counters (`book:views:<id>`) and login counters in-memory.
3. **Book Management & User Auth REST API (`bookstore-api`)**:
   - Full CRUD operations, keyword search, genre filtering, and configurable pagination (from 12 up to 100 items per request).
   - Token-protected mutating routes (`POST /api/books`, `PUT /api/books/<id>`, `DELETE /api/books/<id>`).
   - Telemetry payload generator (`GET /api/telemetry/payload?size_kb=500`) for network throughput edge testing.
4. **Interactive Single Page Web Application (`bookstore-frontend`)**:
   - A real, responsive web UI (not just curl commands!).
   - Interactive book catalog grid with cover badges, live search debounce, sorting, and pagination.
   - Sign In / Register modal with active Redis session display and TTL indicator.
   - "Add Book" modal for authenticated catalog additions.
   - Live throughput & round-trip latency panel displaying payload size in KB.
5. **Continuous Traffic Generator (`bookstore-traffic-gen`)**:
   - Generates realistic user browsing, searching, single-item lookups, and session logins at configurable rates (default 5-10 RPS).

---

## 2. Docker Hub Repositories & Container Images

The microservices are containerized and published to Docker Hub:

| Service | Docker Hub Repository | Description |
| :--- | :--- | :--- |
| **API** | `docker.io/botonetics/klyster-telemetry-example_3_api:latest` | Python REST API with DB & Redis clients |
| **Frontend** | `docker.io/botonetics/klyster-telemetry-example_3_frontend:latest` | Nginx SPA with reverse proxy |
| **Traffic Gen** | `docker.io/botonetics/klyster-telemetry-example_3_traffic_gen:latest` | User traffic simulator |

### Build and Push Images

To build and publish images to Docker Hub:

```bash
# 1. Build all container images locally
./build-and-push.sh build

# 2. Login to Docker Hub
docker login docker.io -u botonetics

# 3. Push images to Docker Hub
./build-and-push.sh push
```

---

## 3. Quickstart Options

### Option A: Local Deployment with Docker Compose

Run the entire multi-tier stack locally in seconds:

```bash
docker compose up -d

# Run the comprehensive 28-case API verification suite using curl
./test-api-curl.sh http://localhost:8080 http://localhost:8088
```

- Web UI: Open `http://localhost:8088` in your browser.
- Direct API: `http://localhost:8080/api/books`
- API Health: `http://localhost:8080/healthz`

### Option B: Kubernetes Deployment (MicroK8s or Cluster)

Deploy all StatefulSets, Deployments, and Services into the `klystr-bookstore` namespace:

```bash
# 1. Build and import images into MicroK8s cache (handled automatically in deploy.sh)
./build-and-push.sh build

# 2. Deploy all workloads and verify 100 seeded books
./deploy.sh

# 3. Run the verification test suite
./verify-traffic.sh

# 4. Access the Web UI via port-forward
microk8s kubectl port-forward -n klystr-bookstore svc/bookstore-frontend 8088:80
# Open http://localhost:8088
```

---

## 4. API Endpoints Reference

### Authentication & Sessions (Redis-backed)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user; issues session token stored in Redis | No |
| `POST` | `/api/auth/login` | Authenticate username/password; saves token with 1h TTL | No |
| `POST` | `/api/auth/logout` | Revokes session token from Redis | Yes (`Bearer <token>`) |
| `GET` | `/api/auth/me` | Validates session in Redis in sub-millisecond | Yes (`Bearer <token>`) |
| `GET` | `/api/users` | List registered users and roles | No |

*Pre-seeded demo credentials*:
- `admin` / `admin123`
- `demo_reader` / `reader123`
- `alice_books` / `alice123`

### Book Management (PostgreSQL-backed)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/books` | Search, filter by genre, and paginate books | No |
| `GET` | `/api/books/<id>` | View book details; increments Redis view counter | No |
| `POST` | `/api/books` | Create a new book in the catalog | Yes (`Bearer <token>`) |
| `PUT` | `/api/books/<id>` | Update book attributes | Yes (`Bearer <token>`) |
| `DELETE`| `/api/books/<id>` | Remove book from catalog | Yes (`Bearer <token>`) |
| `GET` | `/api/books/genres` | Summary of genres with book counts and ratings | No |
| `GET` | `/api/books/stats` | Aggregated catalog and Redis session telemetry | No |

### Telemetry Stream Testing

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/telemetry/payload?size_kb=500` | Streams specified payload size (50KB - 10MB) to dynamically trigger high-throughput edge heatmap colors |

---

## 5. Live Networking Telemetry & Heatmap Testing Guide

In the Klystr Telemetry dashboard:

1. **Throughput (KB/s) Observation**:
   - **Small Payload**: In the web UI, select **12 per page** (`/api/books?limit=12`). The network edge between API and database transfers ~3 KB.
   - **Large Payload**: Select **100 per page** (`/api/books?limit=100`) or click **Stream 1MB**. The network edge transfers 100+ KB, shifting the edge color along the heatmap gradient towards the configured Max threshold.
2. **Invert Heatmap Mode**:
   - Enable **Invert** mode on Throughput: queries that transfer small payloads alert in red, while high streaming transfers show in green/blue.
3. **Scaling & Load Injection**:
   - Scale API replicas to observe traffic distribution:
     ```bash
     ./scale-test.sh scale-api 3
     ```
   - Adjust traffic generation rate:
     ```bash
     ./scale-test.sh rps 25
     ```
   - Stream test payload:
     ```bash
     ./scale-test.sh stream 1024
     ```

---

## 6. Cleanup

To tear down the deployment:

```bash
./cleanup.sh
```
