#!/usr/bin/env python3
"""
Klystr Telemetry Example 3 - Microservice Traffic Generator
Continuously simulates diverse user browsing, searching, large-payload retrieval,
and Redis session authentication traffic to exercise the network graph and heatmap.
"""

import os
import sys
import time
import random
import logging
import urllib.request
import urllib.parse
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [traffic-gen] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("traffic-gen")

TARGET_URL = os.getenv("TARGET_URL", "http://frontend:80")
API_DIRECT_URL = os.getenv("API_DIRECT_URL", "http://bookstore-api:8080")
RPS = float(os.getenv("BASE_RPS", os.getenv("RPS", "5.0")))

SEARCH_TERMS = [
    "Distributed", "Design", "Clean", "Architecture", "Python", "Kubernetes",
    "PostgreSQL", "Database", "Algorithms", "Dune", "Foundation", "Neuromancer",
    "1984", "Gatsby", "Sherlock", "Christie", "Marcus", "Seneca", "Lean", "Zero"
]

GENRES = [
    "Computer Science", "Science Fiction", "Classic Literature",
    "Mystery & Thriller", "Philosophy", "Business & Economics"
]

DEMO_USERS = [
    ("admin", "admin123"),
    ("demo_reader", "reader123"),
    ("alice_books", "alice123")
]

active_tokens = []

def send_request(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    
    headers.setdefault("User-Agent", "Klystr-Telemetry-TrafficGen/1.0")
    req_body = None
    if data is not None:
        req_body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.status
            content = response.read()
            duration_ms = (time.time() - start_time) * 1000
            bytes_len = len(content)
            return status, bytes_len, duration_ms, content
    except urllib.error.HTTPError as e:
        duration_ms = (time.time() - start_time) * 1000
        return e.code, 0, duration_ms, None
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        return 0, 0, duration_ms, str(e)

def traffic_loop():
    logger.info(f"Starting traffic generator against {TARGET_URL} (Rate: {RPS} req/sec)...")
    req_counter = 0
    total_bytes = 0

    while True:
        cycle_start = time.time()
        rand = random.random()

        try:
            # 1. 40% Browse catalog with pagination
            if rand < 0.40:
                page = random.randint(1, 5)
                limit = random.choice([12, 24, 50])
                genre = random.choice(GENRES) if random.random() < 0.5 else ""
                qs = urllib.parse.urlencode({"page": page, "limit": limit, "genre": genre})
                url = f"{TARGET_URL}/api/books?{qs}"
                status, length, lat, _ = send_request(url)
                logger.debug(f"[BROWSE] {url} -> {status} ({length} bytes, {lat:.1f}ms)")

            # 2. 25% Keyword Search
            elif rand < 0.65:
                term = random.choice(SEARCH_TERMS)
                qs = urllib.parse.urlencode({"q": term, "limit": 20})
                url = f"{TARGET_URL}/api/books?{qs}"
                status, length, lat, _ = send_request(url)
                logger.debug(f"[SEARCH] '{term}' -> {status} ({length} bytes, {lat:.1f}ms)")

            # 3. 15% Single Book View (hits Redis view count)
            elif rand < 0.80:
                book_id = random.randint(1, 100)
                url = f"{TARGET_URL}/api/books/{book_id}"
                status, length, lat, _ = send_request(url)
                logger.debug(f"[VIEW] Book #{book_id} -> {status} ({lat:.1f}ms)")

            # 4. 10% Large Payload Fetch (triggers High Throughput in Heatmap!)
            elif rand < 0.90:
                # Either fetch all 100 books or request simulated stream
                if random.random() < 0.5:
                    url = f"{TARGET_URL}/api/books?limit=100"
                else:
                    size_kb = random.choice([100, 250, 500])
                    url = f"{TARGET_URL}/api/telemetry/payload?size_kb={size_kb}"
                status, length, lat, _ = send_request(url)
                logger.info(f"[HIGH-THROUGHPUT] Streamed {length/1024:.1f} KB -> {status} ({lat:.1f}ms)")

            # 5. 10% Redis Session Auth & Profile Verify
            else:
                user, pwd = random.choice(DEMO_USERS)
                login_url = f"{TARGET_URL}/api/auth/login"
                status, length, lat, raw_resp = send_request(login_url, method="POST", data={"username": user, "password": pwd})
                
                if status == 200 and raw_resp:
                    data = json.loads(raw_resp.decode("utf-8"))
                    token = data.get("token")
                    if token:
                        active_tokens.append(token)
                        if len(active_tokens) > 20:
                            active_tokens.pop(0)

                        # Follow-up: verify token in Redis
                        me_url = f"{TARGET_URL}/api/auth/me"
                        send_request(me_url, headers={"Authorization": f"Bearer {token}"})
                logger.debug(f"[AUTH] User '{user}' login & Redis session verify -> {status}")

            req_counter += 1
            total_bytes += length

            if req_counter % 50 == 0:
                logger.info(f"Traffic Stats: {req_counter} requests sent, {total_bytes / (1024 * 1024):.2f} MB transferred.")

        except Exception as err:
            logger.warning(f"Request iteration failed: {err}")

        # Sleep to enforce configured rate
        elapsed = time.time() - cycle_start
        sleep_time = (1.0 / RPS) - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

if __name__ == "__main__":
    traffic_loop()
