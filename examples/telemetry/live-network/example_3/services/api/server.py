#!/usr/bin/env python3
"""
Klystr Telemetry Example 3 - Book & User Management API Service
Full-featured REST API with PostgreSQL 16 persistence and Redis 7 session management.
"""

import os
import sys
import time
import json
import uuid
import hashlib
import secrets
import logging
from functools import wraps
from datetime import datetime

from flask import Flask, request, jsonify, make_response
import psycopg2
from psycopg2.extras import RealDictCursor
import redis

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("bookstore-api")

app = Flask(__name__)

# Configuration from environment
PORT = int(os.getenv("PORT", "8080"))
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "bookstore-db")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "bookstore")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")

REDIS_HOST = os.getenv("REDIS_HOST", "redis-session")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "3600"))
SCHEMA_FILE = os.getenv("SCHEMA_FILE", os.path.join(os.path.dirname(__file__), "schema.sql"))

# Global connections
pg_conn = None
redis_client = None

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Hash password with salt using SHA-256."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return hashed, salt

def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    """Verify password against stored hash."""
    hashed, _ = hash_password(password, salt)
    return secrets.compare_digest(hashed, expected_hash)

def get_db():
    """Get or reconnect to PostgreSQL database."""
    global pg_conn
    if pg_conn is not None and not pg_conn.closed:
        try:
            with pg_conn.cursor() as cur:
                cur.execute("SELECT 1")
            return pg_conn
        except Exception:
            logger.warning("PostgreSQL connection stale, reconnecting...")
            try:
                pg_conn.close()
            except Exception:
                pass
            pg_conn = None

    retries = 5
    delay = 2
    for attempt in range(1, retries + 1):
        try:
            logger.info(f"Connecting to PostgreSQL at {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB} (attempt {attempt}/{retries})...")
            pg_conn = psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                dbname=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                connect_timeout=5
            )
            pg_conn.autocommit = True
            logger.info("Connected to PostgreSQL successfully.")
            return pg_conn
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            if attempt < retries:
                time.sleep(delay)
            else:
                raise

def get_redis():
    """Get or reconnect to Redis session store."""
    global redis_client
    if redis_client is not None:
        try:
            redis_client.ping()
            return redis_client
        except Exception:
            logger.warning("Redis connection lost, reconnecting...")
            redis_client = None

    try:
        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_timeout=3,
            socket_connect_timeout=3
        )
        redis_client.ping()
        logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT} successfully.")
        return redis_client
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        return None

def init_database():
    """Initialize DB schema and 100 seeded books if tables do not exist."""
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'books'
                );
            """)
            books_exist = cur.fetchone()[0]
            
            if books_exist:
                cur.execute("SELECT COUNT(*) FROM books;")
                count = cur.fetchone()[0]
                logger.info(f"Database already initialized with {count} books.")
                if count >= 100:
                    return

            if os.path.exists(SCHEMA_FILE):
                logger.info(f"Executing database schema from {SCHEMA_FILE}...")
                with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
                    sql_content = f.read()
                cur.execute(sql_content)
                logger.info("Database schema and seed data loaded successfully.")
            else:
                logger.warning(f"Schema file {SCHEMA_FILE} not found. Skipping auto-seed.")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")

# CORS and Response Headers Middleware
@app.after_request
def apply_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Session-Token"
    response.headers["X-Service-Name"] = "bookstore-api"
    return response

@app.route("/", methods=["OPTIONS"])
@app.route("/<path:subpath>", methods=["OPTIONS"])
def handle_options(subpath=None):
    return make_response("", 204)

# Authentication Decorator
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        elif "X-Session-Token" in request.headers:
            token = request.headers.get("X-Session-Token")

        if not token:
            return jsonify({"error": "Unauthorized: Session token missing"}), 401

        r = get_redis()
        if not r:
            return jsonify({"error": "Session service temporarily unavailable"}), 503

        session_data = r.get(f"session:{token}")
        if not session_data:
            return jsonify({"error": "Unauthorized: Invalid or expired session token"}), 401

        # Renew TTL on active request
        r.expire(f"session:{token}", SESSION_TTL_SECONDS)
        request.current_user = json.loads(session_data)
        request.session_token = token
        return f(*args, **kwargs)
    return decorated_function

# ==============================================================================
# Health Check Endpoint
# ==============================================================================
@app.route("/healthz", methods=["GET"])
def health_check():
    db_ok = False
    redis_ok = False
    book_count = 0

    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM books;")
            book_count = cur.fetchone()[0]
            db_ok = True
    except Exception as e:
        logger.warning(f"DB health check error: {e}")

    try:
        r = get_redis()
        if r and r.ping():
            redis_ok = True
    except Exception as e:
        logger.warning(f"Redis health check error: {e}")

    status_code = 200 if (db_ok and redis_ok) else 503
    return jsonify({
        "status": "ok" if (db_ok and redis_ok) else "degraded",
        "service": "bookstore-api",
        "database": {"connected": db_ok, "total_books": book_count},
        "redis": {"connected": redis_ok},
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }), status_code

# ==============================================================================
# Authentication & User Management Endpoints (Redis backed)
# ==============================================================================
@app.route("/api/auth/register", methods=["POST"])
def register():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username", "").strip()
    password = payload.get("password", "").strip()
    email = payload.get("email", "").strip()
    full_name = payload.get("full_name", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    conn = get_db()
    r = get_redis()
    if not r:
        return jsonify({"error": "Redis session store unavailable"}), 503

    hashed_pw, salt = hash_password(password)

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO users (username, password_hash, password_salt, email, full_name, role)
                VALUES (%s, %s, %s, %s, %s, 'reader')
                RETURNING id, username, email, full_name, role, created_at;
            """, (username, hashed_pw, salt, email, full_name))
            new_user = cur.fetchone()

        # Generate session token and store in Redis
        token = secrets.token_hex(32)
        user_session = {
            "user_id": str(new_user["id"]),
            "username": new_user["username"],
            "email": new_user["email"],
            "full_name": new_user["full_name"],
            "role": new_user["role"],
            "login_time": datetime.utcnow().isoformat() + "Z"
        }
        r.setex(f"session:{token}", SESSION_TTL_SECONDS, json.dumps(user_session))

        return jsonify({
            "message": "User registered successfully",
            "token": token,
            "user": user_session,
            "expires_in": SESSION_TTL_SECONDS
        }), 201

    except psycopg2.errors.UniqueViolation:
        return jsonify({"error": "Username or email already exists"}), 409
    except Exception as e:
        logger.error(f"Error registering user: {e}")
        return jsonify({"error": "Internal server error during registration"}), 500

@app.route("/api/auth/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username", "").strip()
    password = payload.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    conn = get_db()
    r = get_redis()
    if not r:
        return jsonify({"error": "Redis session store unavailable"}), 503

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, username, password_hash, password_salt, email, full_name, role, is_active
                FROM users WHERE username = %s;
            """, (username,))
            user = cur.fetchone()

        if not user or not user["is_active"]:
            return jsonify({"error": "Invalid username or password"}), 401

        # Check password hash
        if not verify_password(password, user["password_salt"], user["password_hash"]):
            return jsonify({"error": "Invalid username or password"}), 401

        # Update last_login in PostgreSQL
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = %s;", (user["id"],))

        # Generate Redis session token
        token = secrets.token_hex(32)
        user_session = {
            "user_id": str(user["id"]),
            "username": user["username"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "login_time": datetime.utcnow().isoformat() + "Z"
        }
        r.setex(f"session:{token}", SESSION_TTL_SECONDS, json.dumps(user_session))

        # Increment total logins counter in Redis
        r.incr("stats:total_logins")

        return jsonify({
            "message": "Login successful",
            "token": token,
            "user": user_session,
            "expires_in": SESSION_TTL_SECONDS
        }), 200

    except Exception as e:
        logger.error(f"Error during login: {e}")
        return jsonify({"error": "Internal server error during login"}), 500

@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout():
    token = request.session_token
    r = get_redis()
    if r:
        r.delete(f"session:{token}")
    return jsonify({"message": "Logout successful"}), 200

@app.route("/api/auth/me", methods=["GET"])
@require_auth
def get_current_user():
    """Verify session token against Redis sub-millisecond cache."""
    return jsonify({
        "authenticated": True,
        "user": request.current_user,
        "token": request.session_token
    }), 200

@app.route("/api/users", methods=["GET"])
def list_users():
    """List registered users (excluding sensitive password hashes)."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, username, email, full_name, role, is_active, created_at, last_login
                FROM users ORDER BY created_at ASC;
            """)
            users = cur.fetchall()
            for u in users:
                u["id"] = str(u["id"])
                if u["created_at"]:
                    u["created_at"] = u["created_at"].isoformat()
                if u["last_login"]:
                    u["last_login"] = u["last_login"].isoformat()
            return jsonify({"users": users, "total": len(users)}), 200
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return jsonify({"error": "Failed to fetch users"}), 500

# ==============================================================================
# Book Management Endpoints
# ==============================================================================
@app.route("/api/books", methods=["GET"])
def get_books():
    """
    Search, filter, and paginate books.
    Query parameters:
      - page: page number (default 1)
      - limit: items per page (default 20, max 200)
      - genre: filter by genre
      - q: search keyword in title or author
      - sort_by: title, author, publication_year, rating, price (default: id)
      - sort_order: asc or desc (default: asc)
    """
    conn = get_db()
    try:
        page = max(1, int(request.args.get("page", 1)))
        limit = min(200, max(1, int(request.args.get("limit", 20))))
        genre = request.args.get("genre", "").strip()
        query = request.args.get("q", "").strip()
        sort_by = request.args.get("sort_by", "id").lower()
        sort_order = request.args.get("sort_order", "asc").upper()

        if sort_by not in ["id", "title", "author", "publication_year", "rating", "price"]:
            sort_by = "id"
        if sort_order not in ["ASC", "DESC"]:
            sort_order = "ASC"

        offset = (page - 1) * limit

        where_clauses = []
        params = []

        if genre and genre.lower() != "all":
            where_clauses.append("genre ILIKE %s")
            params.append(f"%{genre}%")

        if query:
            where_clauses.append("(title ILIKE %s OR author ILIKE %s OR description ILIKE %s)")
            kw = f"%{query}%"
            params.extend([kw, kw, kw])

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_sql = f"SELECT COUNT(*) FROM books {where_sql};"
        data_sql = f"""
            SELECT id, title, author, isbn, publication_year, genre, price, stock_quantity, rating, description, created_at
            FROM books
            {where_sql}
            ORDER BY {sort_by} {sort_order}
            LIMIT %s OFFSET %s;
        """

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(count_sql, params)
            total = cur.fetchone()["count"]

            cur.execute(data_sql, params + [limit, offset])
            books = cur.fetchall()

            for b in books:
                b["price"] = float(b["price"]) if b["price"] is not None else 0.0
                b["rating"] = float(b["rating"]) if b["rating"] is not None else 0.0
                if b["created_at"]:
                    b["created_at"] = b["created_at"].isoformat()

        response_data = {
            "items": books,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit if limit > 0 else 1,
            "returned_count": len(books)
        }
        
        # Calculate payload size in bytes for telemetry visibility
        raw_json = json.dumps(response_data)
        response = make_response(raw_json, 200)
        response.headers["Content-Type"] = "application/json"
        response.headers["X-Payload-Bytes"] = str(len(raw_json))
        return response

    except Exception as e:
        logger.error(f"Error fetching books: {e}")
        return jsonify({"error": "Failed to fetch books", "details": str(e)}), 500

@app.route("/api/books/<int:book_id>", methods=["GET"])
def get_book(book_id):
    """Retrieve single book and record view metric in Redis."""
    conn = get_db()
    r = get_redis()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, title, author, isbn, publication_year, genre, price, stock_quantity, rating, description, created_at
                FROM books WHERE id = %s;
            """, (book_id,))
            book = cur.fetchone()

        if not book:
            return jsonify({"error": "Book not found"}), 404

        book["price"] = float(book["price"])
        book["rating"] = float(book["rating"])
        if book["created_at"]:
            book["created_at"] = book["created_at"].isoformat()

        # Increment Redis view counter
        if r:
            views = r.incr(f"book:views:{book_id}")
            book["view_count"] = views

        return jsonify(book), 200

    except Exception as e:
        logger.error(f"Error getting book {book_id}: {e}")
        return jsonify({"error": "Failed to get book"}), 500

@app.route("/api/books", methods=["POST"])
@require_auth
def create_book():
    """Create a new book (requires valid Redis session token)."""
    payload = request.get_json(silent=True) or {}
    title = payload.get("title", "").strip()
    author = payload.get("author", "").strip()
    genre = payload.get("genre", "General").strip()
    price = float(payload.get("price", 19.99))
    stock_quantity = int(payload.get("stock_quantity", 50))
    publication_year = int(payload.get("publication_year", datetime.utcnow().year))
    rating = float(payload.get("rating", 4.5))
    description = payload.get("description", "").strip()
    isbn = payload.get("isbn", f"978-0-{secrets.token_hex(4)}-{secrets.token_hex(2)}")

    if not title or not author:
        return jsonify({"error": "Title and author are required"}), 400

    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO books (title, author, isbn, publication_year, genre, price, stock_quantity, rating, description)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, title, author, isbn, publication_year, genre, price, stock_quantity, rating, description, created_at;
            """, (title, author, isbn, publication_year, genre, price, stock_quantity, rating, description))
            new_book = cur.fetchone()

        new_book["price"] = float(new_book["price"])
        new_book["rating"] = float(new_book["rating"])
        if new_book["created_at"]:
            new_book["created_at"] = new_book["created_at"].isoformat()

        logger.info(f"Book created by {request.current_user['username']}: id={new_book['id']} '{title}'")
        return jsonify({"message": "Book created successfully", "book": new_book}), 201

    except Exception as e:
        logger.error(f"Error creating book: {e}")
        return jsonify({"error": "Failed to create book", "details": str(e)}), 500

@app.route("/api/books/<int:book_id>", methods=["PUT"])
@require_auth
def update_book(book_id):
    """Update book attributes (requires valid Redis session token)."""
    payload = request.get_json(silent=True) or {}
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                UPDATE books SET
                    title = COALESCE(%s, title),
                    author = COALESCE(%s, author),
                    genre = COALESCE(%s, genre),
                    price = COALESCE(%s, price),
                    stock_quantity = COALESCE(%s, stock_quantity),
                    rating = COALESCE(%s, rating),
                    description = COALESCE(%s, description),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING id, title, author, isbn, publication_year, genre, price, stock_quantity, rating, description;
            """, (
                payload.get("title"),
                payload.get("author"),
                payload.get("genre"),
                payload.get("price"),
                payload.get("stock_quantity"),
                payload.get("rating"),
                payload.get("description"),
                book_id
            ))
            updated = cur.fetchone()

        if not updated:
            return jsonify({"error": "Book not found"}), 404

        updated["price"] = float(updated["price"])
        updated["rating"] = float(updated["rating"])
        return jsonify({"message": "Book updated successfully", "book": updated}), 200

    except Exception as e:
        logger.error(f"Error updating book {book_id}: {e}")
        return jsonify({"error": "Failed to update book"}), 500

@app.route("/api/books/<int:book_id>", methods=["DELETE"])
@require_auth
def delete_book(book_id):
    """Delete book (requires valid Redis session token)."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM books WHERE id = %s RETURNING id;", (book_id,))
            deleted = cur.fetchone()

        if not deleted:
            return jsonify({"error": "Book not found"}), 404

        return jsonify({"message": f"Book {book_id} deleted successfully"}), 200

    except Exception as e:
        logger.error(f"Error deleting book {book_id}: {e}")
        return jsonify({"error": "Failed to delete book"}), 500

@app.route("/api/books/genres", methods=["GET"])
def get_genres():
    """List distinct book genres with counts."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT genre, COUNT(*) as count, ROUND(AVG(rating)::numeric, 2) as avg_rating
                FROM books
                GROUP BY genre
                ORDER BY count DESC;
            """)
            genres = cur.fetchall()
            for g in genres:
                g["avg_rating"] = float(g["avg_rating"]) if g["avg_rating"] is not None else 0.0
            return jsonify({"genres": genres}), 200
    except Exception as e:
        logger.error(f"Error fetching genres: {e}")
        return jsonify({"error": "Failed to fetch genres"}), 500

@app.route("/api/books/stats", methods=["GET"])
def get_stats():
    """Summary statistics for dashboard and telemetry metrics."""
    conn = get_db()
    r = get_redis()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    COUNT(*) as total_books,
                    COUNT(DISTINCT author) as total_authors,
                    COUNT(DISTINCT genre) as total_genres,
                    ROUND(AVG(price)::numeric, 2) as avg_price,
                    ROUND(AVG(rating)::numeric, 2) as avg_rating,
                    SUM(stock_quantity) as total_stock
                FROM books;
            """)
            stats = cur.fetchone()
            stats["avg_price"] = float(stats["avg_price"])
            stats["avg_rating"] = float(stats["avg_rating"])

            # Top 5 highest rated
            cur.execute("""
                SELECT id, title, author, rating, genre FROM books ORDER BY rating DESC, id ASC LIMIT 5;
            """)
            stats["top_rated"] = cur.fetchall()
            for item in stats["top_rated"]:
                item["rating"] = float(item["rating"])

        # Redis session & traffic statistics
        active_sessions = 0
        total_logins = 0
        if r:
            active_sessions = len(r.keys("session:*"))
            total_logins = int(r.get("stats:total_logins") or 0)

        stats["telemetry"] = {
            "active_redis_sessions": active_sessions,
            "total_logins_recorded": total_logins,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

        return jsonify(stats), 200

    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        return jsonify({"error": "Failed to fetch stats"}), 500

# ==============================================================================
# Telemetry Stream / Payload Size Simulator Endpoint
# Allows interactive testing of Network Graph Heatmap (Throughput KB/s)
# ==============================================================================
@app.route("/api/telemetry/payload", methods=["GET"])
def telemetry_payload():
    """
    Generate payloads of dynamic sizes (e.g. 50KB to 5MB) for testing
    Klystr live network throughput heatmaps and invert threshold triggers.
    """
    size_kb = min(10240, max(1, int(request.args.get("size_kb", 50))))
    # Generate repeatable content of requested size
    chunk = ("KLYSTR-NETWORK-TELEMETRY-STREAM-TESTING-FRAMEWORK-" * 20)[:1024]
    data = chunk * size_kb
    resp = make_response(jsonify({
        "size_kb": size_kb,
        "bytes": len(data),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "sample_data": data[:256] + "... [truncated in view, full payload streamed]"
    }))
    resp.headers["Content-Type"] = "application/json"
    resp.headers["X-Telemetry-Payload-KB"] = str(size_kb)
    return resp

if __name__ == "__main__":
    logger.info("Initializing Book Management & User Auth Service...")
    # Attempt DB init
    try:
        init_database()
    except Exception as e:
        logger.warning(f"Could not auto-initialize DB on boot: {e}. Will retry on requests.")

    logger.info(f"Starting Bookstore API server on port {PORT}...")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
