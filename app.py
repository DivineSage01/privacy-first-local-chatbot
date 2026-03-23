from __future__ import annotations

import json
import re
import shutil
import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, request, jsonify, send_from_directory, session
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ── App ────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="chatbot", static_url_path="")
app.secret_key = "lumen-change-this-secret-key-before-sharing"

# ── Paths ──────────────────────────────────────────────────────
DATA_DIR       = Path("data")
KNOWLEDGE_PATH = DATA_DIR / "knowledge.json"
PROGRESS_PATH  = DATA_DIR / "progress.json"
BACKUP_DIR     = DATA_DIR / "backups"
DB_PATH        = DATA_DIR / "lumen.db"
TEMPLATES_DIR  = DATA_DIR / "contract_templates"
MAX_BACKUPS    = 10

# ── Admin credentials ──────────────────────────────────────────
ADMIN_CREDENTIALS = {
    "admin@lumen.local": "AdminPass1!",
}

# ── TF-IDF globals ─────────────────────────────────────────────
VECTORIZER = TfidfVectorizer(stop_words="english")
ENTRIES: list[dict[str, Any]] = []
CHUNKS:  list[str] = []
CHUNK_VECS = None

# ── Filler words stripped before TF-IDF ───────────────────────
FILLER_RE = re.compile(
    r"^(what is|what are|what'?s|when is|when are|where is|where are|"
    r"who is|who are|how do i|how does|can you tell me|tell me about|"
    r"do you know|i want to know|yeah|please|could you|can you|"
    r"i need to know|give me|show me)\s+",
    re.IGNORECASE,
)

def clean_query(text: str) -> str:
    return FILLER_RE.sub("", text).strip()


# ══════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

@contextmanager
def db():
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS players (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            position    TEXT,
            squad_no    INTEGER,
            date_joined TEXT,
            status      TEXT DEFAULT 'active',
            email       TEXT,
            phone       TEXT,
            notes       TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS memberships (
            id           TEXT PRIMARY KEY,
            player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            season       TEXT NOT NULL,
            type         TEXT DEFAULT 'senior',
            fee_due      REAL DEFAULT 0,
            fee_paid     REAL DEFAULT 0,
            join_date    TEXT,
            expiry_date  TEXT,
            status       TEXT DEFAULT 'active',
            notes        TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS performance (
            id           TEXT PRIMARY KEY,
            player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            season       TEXT NOT NULL,
            match_date   TEXT,
            opponent     TEXT,
            match_type   TEXT DEFAULT 'league',
            goals        INTEGER DEFAULT 0,
            assists      INTEGER DEFAULT 0,
            minutes      INTEGER DEFAULT 0,
            rating       REAL,
            fitness_score REAL,
            notes        TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id          TEXT PRIMARY KEY,
            player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            session_date TEXT NOT NULL,
            session_type TEXT DEFAULT 'training',
            present     INTEGER DEFAULT 1,
            notes       TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS contracts (
            id            TEXT PRIMARY KEY,
            player_id     TEXT REFERENCES players(id) ON DELETE SET NULL,
            template_id   TEXT NOT NULL,
            title         TEXT,
            content       TEXT,
            status        TEXT DEFAULT 'draft',
            created_at    TEXT DEFAULT (datetime('now')),
            updated_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS query_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            query       TEXT,
            clean_query TEXT,
            matched     INTEGER DEFAULT 0,
            score       REAL,
            user_email  TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );
        """)
    _seed_templates()


def _seed_templates() -> None:
    """Create default contract templates if none exist."""
    templates = [
        {
            "id": "TPL-PLAYER",
            "name": "Player Registration Contract",
            "content": """PLAYER REGISTRATION AGREEMENT

Club: Lumen FC
Date: {{date}}

Player Details
Name: {{player_name}}
Position: {{position}}
Squad Number: {{squad_no}}
Date of Birth: {{dob}}

Terms
1. The player agrees to register exclusively with Lumen FC for the season {{season}}.
2. The player agrees to attend a minimum of 60% of all scheduled training sessions.
3. The player agrees to abide by the Lumen FC Code of Conduct at all times.
4. The player agrees to pay the registration fee of {{fee}} as agreed.
5. The club agrees to provide the player with access to all training facilities and coaching.
6. Either party may terminate this agreement with 14 days written notice.

Signatures
Player: _________________________ Date: _____________
Club Representative: _________________________ Date: _____________
"""
        },
        {
            "id": "TPL-MEMBERSHIP",
            "name": "Annual Membership Agreement",
            "content": """ANNUAL MEMBERSHIP AGREEMENT

Club: Lumen FC
Season: {{season}}
Date: {{date}}

Member Details
Name: {{player_name}}
Email: {{email}}
Membership Type: {{membership_type}}

Financial Terms
Annual Fee: £{{fee}}
Payment Due: {{payment_date}}
Payment Method: {{payment_method}}

Benefits
- Full access to training facilities at Lumen Park
- Matchday squad eligibility
- Access to club gym
- Club physiotherapy service
- Club newsletter and communications

I agree to the terms of membership and the Lumen FC Code of Conduct.

Member Signature: _________________________ Date: _____________
Secretary Signature: _________________________ Date: _____________
"""
        },
        {
            "id": "TPL-COACHING",
            "name": "Coaching / Volunteer Agreement",
            "content": """COACHING & VOLUNTEER AGREEMENT

Club: Lumen FC
Date: {{date}}

Volunteer Details
Name: {{player_name}}
Role: {{position}}
Start Date: {{join_date}}

Responsibilities
1. {{player_name}} agrees to fulfil the role of {{position}} for Lumen FC.
2. This is a voluntary unpaid role unless otherwise stated.
3. The volunteer agrees to maintain a valid DBS check throughout their tenure.
4. The volunteer agrees to complete relevant FA coaching qualifications as required.
5. The volunteer agrees to uphold the club safeguarding and conduct policies.

Duration
This agreement covers the {{season}} season and is subject to annual review.

Signatures
Volunteer: _________________________ Date: _____________
Club Chairman: _________________________ Date: _____________
"""
        },
    ]
    existing = TEMPLATES_DIR.glob("*.json")
    existing_ids = {p.stem for p in existing}
    for t in templates:
        if t["id"] not in existing_ids:
            path = TEMPLATES_DIR / f"{t['id']}.json"
            path.write_text(json.dumps(t, indent=2), encoding="utf-8")


def row_to_dict(row) -> dict:
    return dict(row) if row else {}

def rows_to_list(rows) -> list:
    return [dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════
# JSON helpers (knowledge + progress — kept for compatibility)
# ══════════════════════════════════════════════════════════════

def _read_json(path: Path) -> list:
    if not path.exists():
        return []
    raw = path.read_text(encoding="utf-8", errors="replace").strip()
    return json.loads(raw) if raw else []

def _write_json(path: Path, data: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def _backup(path: Path) -> None:
    if not path.exists():
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"{path.stem}_{ts}.json"
    shutil.copy2(path, dest)
    old = sorted(BACKUP_DIR.glob(f"{path.stem}_*.json"), key=lambda p: p.stat().st_mtime)
    for o in old[:-MAX_BACKUPS]:
        o.unlink(missing_ok=True)

def list_backups(stem: str) -> list:
    if not BACKUP_DIR.exists():
        return []
    return sorted((p.name for p in BACKUP_DIR.glob(f"{stem}_*.json")), reverse=True)


# ══════════════════════════════════════════════════════════════
# TF-IDF
# ══════════════════════════════════════════════════════════════

def load_entries() -> list:
    cleaned = []
    for item in _read_json(KNOWLEDGE_PATH):
        if not isinstance(item, dict):
            continue
        _id     = str(item.get("id", "")).strip()
        content = str(item.get("content", "")).strip()
        if not _id or not content:
            continue
        cleaned.append({
            "id":       _id,
            "category": str(item.get("category", "General")).strip() or "General",
            "title":    str(item.get("title", "")).strip(),
            "content":  content,
        })
    return cleaned

def rebuild_index() -> None:
    global ENTRIES, CHUNKS, CHUNK_VECS
    ENTRIES    = load_entries()
    CHUNKS     = [f"{e['category']}\n{e['title']}\n{e['content']}".strip() for e in ENTRIES]
    CHUNK_VECS = VECTORIZER.fit_transform(CHUNKS) if CHUNKS else None

def answer_question(question: str) -> dict:
    q = clean_query(question)
    if not CHUNKS or CHUNK_VECS is None:
        return {"answer": "Knowledge base is empty. Ask an admin to add entries.", "src_info": ""}
    q_vec      = VECTORIZER.transform([q])
    sims       = cosine_similarity(q_vec, CHUNK_VECS)[0]
    best_idx   = int(sims.argmax())
    best_score = float(sims[best_idx])
    if best_score < 0.15:
        return {"answer": "I can't find that information in the knowledge base yet.", "src_info": "No reliable match"}
    e = ENTRIES[best_idx]
    return {
        "answer":   e["content"],
        "src_info": f"{e['id']} • {e['category']} (similarity {best_score:.2f})",
    }

rebuild_index()


# ══════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get("role") != "admin":
            return jsonify({"error": "Unauthorised"}), 401
        return f(*args, **kwargs)
    return decorated


# ══════════════════════════════════════════════════════════════
# STATIC
# ══════════════════════════════════════════════════════════════

@app.get("/")
def home():
    return send_from_directory("chatbot", "index.html")

@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory("chatbot", filename)


# ══════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════

@app.post("/auth/login")
def auth_login():
    data     = request.get_json(silent=True) or {}
    email    = str(data.get("email",    "")).strip().lower()
    password = str(data.get("password", ""))
    role     = str(data.get("role",     "user")).strip().lower()
    if role == "admin":
        if ADMIN_CREDENTIALS.get(email) == password:
            session["role"]  = "admin"
            session["email"] = email
            return jsonify({"status": "ok", "role": "admin"})
        return jsonify({"error": "Invalid admin credentials"}), 401
    if email and password:
        session["role"]  = "user"
        session["email"] = email
        return jsonify({"status": "ok", "role": "user"})
    return jsonify({"error": "Invalid credentials"}), 401

@app.post("/auth/logout")
def auth_logout():
    session.clear()
    return jsonify({"status": "logged out"})

@app.get("/auth/me")
def auth_me():
    if "role" in session:
        return jsonify({"role": session["role"], "email": session["email"]})
    return jsonify({"role": None}), 401


# ══════════════════════════════════════════════════════════════
# CHATBOT
# ══════════════════════════════════════════════════════════════

@app.post("/ask")
def ask():
    data  = request.get_json(silent=True) or {}
    q     = (data.get("q") or "").strip()
    if not q:
        return jsonify({"answer": "Please type a question.", "src_info": ""})
    result = answer_question(q)
    matched = 1 if not result["answer"].startswith("I can't find") else 0
    score   = float(result.get("src_info", "0").split("similarity ")[-1].replace(")", "")) if "similarity" in result.get("src_info","") else 0.0
    with db() as conn:
        conn.execute(
            "INSERT INTO query_log (query, clean_query, matched, score, user_email) VALUES (?,?,?,?,?)",
            (q, clean_query(q), matched, score, session.get("email", "anonymous"))
        )
    return jsonify(result)


# ══════════════════════════════════════════════════════════════
# KNOWLEDGE BASE CRUD
# ══════════════════════════════════════════════════════════════

@app.get("/api/entries")
def api_entries():
    return jsonify(ENTRIES)

@app.post("/api/entries")
@require_admin
def api_add_entry():
    data      = request.get_json(silent=True) or {}
    new_entry = {
        "id":       str(data.get("id",       "")).strip(),
        "category": str(data.get("category", "General")).strip() or "General",
        "title":    str(data.get("title",    "")).strip(),
        "content":  str(data.get("content",  "")).strip(),
    }
    if not new_entry["id"] or not new_entry["content"]:
        return jsonify({"error": "id and content are required"}), 400
    if any(e["id"] == new_entry["id"] for e in ENTRIES):
        return jsonify({"error": "ID already exists"}), 400
    updated = ENTRIES + [new_entry]
    _backup(KNOWLEDGE_PATH)
    _write_json(KNOWLEDGE_PATH, updated)
    rebuild_index()
    return jsonify({"status": "added", "entry": new_entry})

@app.put("/api/entries/<entry_id>")
@require_admin
def api_update_entry(entry_id: str):
    data    = request.get_json(silent=True) or {}
    updated = []
    found   = False
    for e in ENTRIES:
        if e["id"] == entry_id.strip():
            found = True
            updated.append({
                "id":       entry_id,
                "category": str(data.get("category", e["category"])).strip() or "General",
                "title":    str(data.get("title",    e["title"])).strip(),
                "content":  str(data.get("content",  e["content"])).strip() or e["content"],
            })
        else:
            updated.append(e)
    if not found:
        return jsonify({"error": "Entry not found"}), 404
    _backup(KNOWLEDGE_PATH)
    _write_json(KNOWLEDGE_PATH, updated)
    rebuild_index()
    return jsonify({"status": "updated", "id": entry_id})

@app.delete("/api/entries/<entry_id>")
@require_admin
def api_delete_entry(entry_id: str):
    updated = [e for e in ENTRIES if e["id"] != entry_id.strip()]
    _backup(KNOWLEDGE_PATH)
    _write_json(KNOWLEDGE_PATH, updated)
    rebuild_index()
    return jsonify({"status": "deleted", "id": entry_id})

@app.get("/api/overview")
def api_overview():
    cats = Counter(e["category"] for e in ENTRIES)
    return jsonify({"total_entries": len(ENTRIES), "categories": dict(cats), "entry_ids": [e["id"] for e in ENTRIES]})


# ══════════════════════════════════════════════════════════════
# PROGRESS (legacy JSON)
# ══════════════════════════════════════════════════════════════

def load_progress() -> list:
    return _read_json(PROGRESS_PATH)

@app.get("/api/progress")
def api_progress():
    return jsonify(load_progress())

@app.post("/api/progress")
@require_admin
def api_add_progress():
    data   = request.get_json(silent=True) or {}
    record = {
        "id":       str(data.get("id",       "")).strip(),
        "date":     str(data.get("date",     datetime.now().strftime("%Y-%m-%d"))).strip(),
        "member":   str(data.get("member",   "")).strip(),
        "category": str(data.get("category", "General")).strip(),
        "value":    data.get("value", ""),
        "notes":    str(data.get("notes",    "")).strip(),
    }
    if not record["id"] or not record["member"]:
        return jsonify({"error": "id and member are required"}), 400
    records = load_progress()
    if any(r["id"] == record["id"] for r in records):
        return jsonify({"error": "ID already exists"}), 400
    records.append(record)
    _backup(PROGRESS_PATH)
    _write_json(PROGRESS_PATH, records)
    return jsonify({"status": "added", "record": record})

@app.delete("/api/progress/<record_id>")
@require_admin
def api_delete_progress(record_id: str):
    records = [r for r in load_progress() if r["id"] != record_id.strip()]
    _backup(PROGRESS_PATH)
    _write_json(PROGRESS_PATH, records)
    return jsonify({"status": "deleted", "id": record_id})


# ══════════════════════════════════════════════════════════════
# BACKUPS
# ══════════════════════════════════════════════════════════════

@app.get("/api/backups")
@require_admin
def api_list_backups():
    return jsonify({"knowledge": list_backups("knowledge"), "progress": list_backups("progress")})

@app.post("/api/backups/restore")
@require_admin
def api_restore_backup():
    data     = request.get_json(silent=True) or {}
    filename = str(data.get("filename", "")).strip()
    if not filename:
        return jsonify({"error": "filename required"}), 400
    src = BACKUP_DIR / filename
    if not src.exists():
        return jsonify({"error": "Backup file not found"}), 404
    live = KNOWLEDGE_PATH if filename.startswith("knowledge") else PROGRESS_PATH
    _backup(live)
    shutil.copy2(src, live)
    rebuild_index()
    return jsonify({"status": "restored", "filename": filename})


# ══════════════════════════════════════════════════════════════
# PLAYERS
# ══════════════════════════════════════════════════════════════

@app.get("/api/players")
@require_admin
def api_players():
    with db() as conn:
        rows = conn.execute("SELECT * FROM players ORDER BY name").fetchall()
    return jsonify(rows_to_list(rows))

@app.post("/api/players")
@require_admin
def api_add_player():
    d = request.get_json(silent=True) or {}
    pid = str(d.get("id","")).strip()
    name = str(d.get("name","")).strip()
    if not pid or not name:
        return jsonify({"error": "id and name are required"}), 400
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO players (id,name,position,squad_no,date_joined,status,email,phone,notes) VALUES (?,?,?,?,?,?,?,?,?)",
                (pid, name, d.get("position",""), d.get("squad_no"), d.get("date_joined",""),
                 d.get("status","active"), d.get("email",""), d.get("phone",""), d.get("notes",""))
            )
        return jsonify({"status": "added", "id": pid})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Player ID already exists"}), 400

@app.put("/api/players/<player_id>")
@require_admin
def api_update_player(player_id: str):
    d = request.get_json(silent=True) or {}
    with db() as conn:
        conn.execute(
            """UPDATE players SET name=?, position=?, squad_no=?, date_joined=?,
               status=?, email=?, phone=?, notes=?, updated_at=datetime('now')
               WHERE id=?""",
            (d.get("name"), d.get("position"), d.get("squad_no"), d.get("date_joined"),
             d.get("status","active"), d.get("email",""), d.get("phone",""), d.get("notes",""), player_id)
        )
    return jsonify({"status": "updated", "id": player_id})

@app.delete("/api/players/<player_id>")
@require_admin
def api_delete_player(player_id: str):
    with db() as conn:
        conn.execute("DELETE FROM players WHERE id=?", (player_id,))
    return jsonify({"status": "deleted", "id": player_id})

@app.get("/api/players/<player_id>")
@require_admin
def api_get_player(player_id: str):
    with db() as conn:
        player = row_to_dict(conn.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone())
        memberships = rows_to_list(conn.execute("SELECT * FROM memberships WHERE player_id=? ORDER BY season DESC", (player_id,)).fetchall())
        performance = rows_to_list(conn.execute("SELECT * FROM performance WHERE player_id=? ORDER BY match_date DESC", (player_id,)).fetchall())
        attendance  = rows_to_list(conn.execute("SELECT * FROM attendance  WHERE player_id=? ORDER BY session_date DESC", (player_id,)).fetchall())
    return jsonify({"player": player, "memberships": memberships, "performance": performance, "attendance": attendance})


# ══════════════════════════════════════════════════════════════
# MEMBERSHIPS
# ══════════════════════════════════════════════════════════════

@app.get("/api/memberships")
@require_admin
def api_memberships():
    with db() as conn:
        rows = conn.execute("""
            SELECT m.*, p.name as player_name
            FROM memberships m JOIN players p ON m.player_id = p.id
            ORDER BY m.season DESC, p.name
        """).fetchall()
    return jsonify(rows_to_list(rows))

@app.post("/api/memberships")
@require_admin
def api_add_membership():
    d = request.get_json(silent=True) or {}
    mid = str(d.get("id","")).strip()
    pid = str(d.get("player_id","")).strip()
    season = str(d.get("season","")).strip()
    if not mid or not pid or not season:
        return jsonify({"error": "id, player_id, and season are required"}), 400
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO memberships (id,player_id,season,type,fee_due,fee_paid,join_date,expiry_date,status,notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (mid, pid, season, d.get("type","senior"), d.get("fee_due",0), d.get("fee_paid",0),
                 d.get("join_date",""), d.get("expiry_date",""), d.get("status","active"), d.get("notes",""))
            )
        return jsonify({"status": "added", "id": mid})
    except sqlite3.IntegrityError as e:
        return jsonify({"error": str(e)}), 400

@app.delete("/api/memberships/<mem_id>")
@require_admin
def api_delete_membership(mem_id: str):
    with db() as conn:
        conn.execute("DELETE FROM memberships WHERE id=?", (mem_id,))
    return jsonify({"status": "deleted", "id": mem_id})


# ══════════════════════════════════════════════════════════════
# PERFORMANCE
# ══════════════════════════════════════════════════════════════

@app.get("/api/performance")
@require_admin
def api_performance():
    player_id  = request.args.get("player_id")
    season     = request.args.get("season")
    date_from  = request.args.get("date_from")
    date_to    = request.args.get("date_to")

    sql    = "SELECT per.*, p.name as player_name FROM performance per JOIN players p ON per.player_id=p.id WHERE 1=1"
    params = []
    if player_id: sql += " AND per.player_id=?";  params.append(player_id)
    if season:    sql += " AND per.season=?";      params.append(season)
    if date_from: sql += " AND per.match_date>=?"; params.append(date_from)
    if date_to:   sql += " AND per.match_date<=?"; params.append(date_to)
    sql += " ORDER BY per.match_date DESC"

    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return jsonify(rows_to_list(rows))

@app.post("/api/performance")
@require_admin
def api_add_performance():
    d   = request.get_json(silent=True) or {}
    pid = str(d.get("id","")).strip()
    if not pid or not d.get("player_id") or not d.get("season"):
        return jsonify({"error": "id, player_id, and season are required"}), 400
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO performance (id,player_id,season,match_date,opponent,match_type,goals,assists,minutes,rating,fitness_score,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (pid, d["player_id"], d["season"], d.get("match_date",""), d.get("opponent",""),
                 d.get("match_type","league"), d.get("goals",0), d.get("assists",0),
                 d.get("minutes",0), d.get("rating"), d.get("fitness_score"), d.get("notes",""))
            )
        return jsonify({"status": "added", "id": pid})
    except sqlite3.IntegrityError as e:
        return jsonify({"error": str(e)}), 400

@app.delete("/api/performance/<perf_id>")
@require_admin
def api_delete_performance(perf_id: str):
    with db() as conn:
        conn.execute("DELETE FROM performance WHERE id=?", (perf_id,))
    return jsonify({"status": "deleted", "id": perf_id})

@app.get("/api/performance/compare")
@require_admin
def api_compare_performance():
    """Compare two players or one player across two seasons."""
    player_a  = request.args.get("player_a")
    player_b  = request.args.get("player_b")
    season_a  = request.args.get("season_a")
    season_b  = request.args.get("season_b")

    def get_stats(player_id, season):
        with db() as conn:
            row = conn.execute("""
                SELECT
                    p.name,
                    COUNT(*)            as appearances,
                    SUM(per.goals)      as goals,
                    SUM(per.assists)    as assists,
                    SUM(per.minutes)    as minutes,
                    ROUND(AVG(per.rating),2)        as avg_rating,
                    ROUND(AVG(per.fitness_score),2) as avg_fitness,
                    per.season
                FROM performance per JOIN players p ON per.player_id=p.id
                WHERE per.player_id=? AND per.season=?
            """, (player_id, season)).fetchone()
        return row_to_dict(row)

    result = {}
    if player_a and season_a:
        result["a"] = get_stats(player_a, season_a)
    if player_b and season_b:
        result["b"] = get_stats(player_b, season_b)
    elif player_a and season_b:
        result["b"] = get_stats(player_a, season_b)

    return jsonify(result)

@app.get("/api/analytics/trends")
@require_admin
def api_trends():
    """Attendance and scoring trends by month."""
    season = request.args.get("season", "2024-25")
    with db() as conn:
        goals_by_month = rows_to_list(conn.execute("""
            SELECT strftime('%Y-%m', match_date) as month,
                   SUM(goals) as goals, SUM(assists) as assists, COUNT(*) as matches
            FROM performance WHERE season=?
            GROUP BY month ORDER BY month
        """, (season,)).fetchall())

        attendance_by_month = rows_to_list(conn.execute("""
            SELECT strftime('%Y-%m', session_date) as month,
                   SUM(present) as present,
                   COUNT(*) as total,
                   ROUND(100.0*SUM(present)/COUNT(*),1) as pct
            FROM attendance WHERE strftime('%Y', session_date) >= '2024'
            GROUP BY month ORDER BY month
        """).fetchall())

        top_scorers = rows_to_list(conn.execute("""
            SELECT p.name, p.id, SUM(per.goals) as goals, SUM(per.assists) as assists
            FROM performance per JOIN players p ON per.player_id=p.id
            WHERE per.season=?
            GROUP BY per.player_id ORDER BY goals DESC LIMIT 10
        """, (season,)).fetchall())

        query_stats = rows_to_list(conn.execute("""
            SELECT clean_query as query,
                   COUNT(*) as times_asked,
                   ROUND(AVG(score),2) as avg_score,
                   SUM(matched) as matched
            FROM query_log
            GROUP BY clean_query ORDER BY times_asked DESC LIMIT 20
        """).fetchall())

    return jsonify({
        "season": season,
        "goals_by_month": goals_by_month,
        "attendance_by_month": attendance_by_month,
        "top_scorers": top_scorers,
        "query_stats": query_stats,
    })


# ══════════════════════════════════════════════════════════════
# ATTENDANCE
# ══════════════════════════════════════════════════════════════

@app.get("/api/attendance")
@require_admin
def api_attendance():
    player_id = request.args.get("player_id")
    sql    = "SELECT a.*, p.name as player_name FROM attendance a JOIN players p ON a.player_id=p.id WHERE 1=1"
    params = []
    if player_id: sql += " AND a.player_id=?"; params.append(player_id)
    sql += " ORDER BY a.session_date DESC"
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return jsonify(rows_to_list(rows))

@app.post("/api/attendance")
@require_admin
def api_add_attendance():
    d = request.get_json(silent=True) or {}
    aid = str(d.get("id","")).strip()
    if not aid or not d.get("player_id") or not d.get("session_date"):
        return jsonify({"error": "id, player_id, session_date required"}), 400
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO attendance (id,player_id,session_date,session_type,present,notes) VALUES (?,?,?,?,?,?)",
                (aid, d["player_id"], d["session_date"], d.get("session_type","training"),
                 1 if d.get("present", True) else 0, d.get("notes",""))
            )
        return jsonify({"status": "added", "id": aid})
    except sqlite3.IntegrityError as e:
        return jsonify({"error": str(e)}), 400

@app.delete("/api/attendance/<att_id>")
@require_admin
def api_delete_attendance(att_id: str):
    with db() as conn:
        conn.execute("DELETE FROM attendance WHERE id=?", (att_id,))
    return jsonify({"status": "deleted", "id": att_id})


# ══════════════════════════════════════════════════════════════
# CONTRACTS
# ══════════════════════════════════════════════════════════════

@app.get("/api/contracts/templates")
@require_admin
def api_list_templates():
    templates = []
    for p in sorted(TEMPLATES_DIR.glob("*.json")):
        try:
            t = json.loads(p.read_text(encoding="utf-8"))
            templates.append({"id": t["id"], "name": t["name"]})
        except Exception:
            pass
    return jsonify(templates)

@app.post("/api/contracts/generate")
@require_admin
def api_generate_contract():
    d           = request.get_json(silent=True) or {}
    template_id = str(d.get("template_id","")).strip()
    player_id   = str(d.get("player_id","")).strip()
    fields      = d.get("fields", {})

    tpl_path = TEMPLATES_DIR / f"{template_id}.json"
    if not tpl_path.exists():
        return jsonify({"error": "Template not found"}), 404

    tpl = json.loads(tpl_path.read_text(encoding="utf-8"))

    # Auto-fill from player record if player_id provided
    if player_id:
        with db() as conn:
            player = row_to_dict(conn.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone())
        if player:
            fields.setdefault("player_name", player.get("name",""))
            fields.setdefault("position",    player.get("position",""))
            fields.setdefault("squad_no",    str(player.get("squad_no","")))
            fields.setdefault("join_date",   player.get("date_joined",""))
            fields.setdefault("email",       player.get("email",""))

    fields.setdefault("date",   datetime.now().strftime("%d %B %Y"))
    fields.setdefault("season", "2024-25")

    # Replace {{field}} placeholders
    content = tpl["content"]
    for key, val in fields.items():
        content = content.replace(f"{{{{{key}}}}}", str(val))

    # Save contract to DB
    contract_id = f"CON-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    title       = f"{tpl['name']} — {fields.get('player_name','Unknown')} ({fields.get('season','')})"
    with db() as conn:
        conn.execute(
            "INSERT INTO contracts (id,player_id,template_id,title,content,status) VALUES (?,?,?,?,?,?)",
            (contract_id, player_id or None, template_id, title, content, "draft")
        )

    return jsonify({"status": "generated", "contract_id": contract_id, "title": title, "content": content})

@app.get("/api/contracts")
@require_admin
def api_list_contracts():
    with db() as conn:
        rows = conn.execute("""
            SELECT c.*, p.name as player_name
            FROM contracts c LEFT JOIN players p ON c.player_id=p.id
            ORDER BY c.created_at DESC
        """).fetchall()
    return jsonify(rows_to_list(rows))

@app.get("/api/contracts/<contract_id>")
@require_admin
def api_get_contract(contract_id: str):
    with db() as conn:
        row = conn.execute("SELECT * FROM contracts WHERE id=?", (contract_id,)).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(row_to_dict(row))

@app.put("/api/contracts/<contract_id>")
@require_admin
def api_update_contract(contract_id: str):
    d = request.get_json(silent=True) or {}
    with db() as conn:
        conn.execute(
            "UPDATE contracts SET content=?, status=?, updated_at=datetime('now') WHERE id=?",
            (d.get("content"), d.get("status","draft"), contract_id)
        )
    return jsonify({"status": "updated"})

@app.delete("/api/contracts/<contract_id>")
@require_admin
def api_delete_contract(contract_id: str):
    with db() as conn:
        conn.execute("DELETE FROM contracts WHERE id=?", (contract_id,))
    return jsonify({"status": "deleted"})


# ══════════════════════════════════════════════════════════════
# ANALYTICS — chatbot-friendly summary endpoint
# ══════════════════════════════════════════════════════════════

@app.get("/api/analytics/player-summary/<player_id>")
@require_admin
def api_player_summary(player_id: str):
    season = request.args.get("season")
    with db() as conn:
        player = row_to_dict(conn.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone())
        sql    = "SELECT * FROM performance WHERE player_id=?"
        params = [player_id]
        if season: sql += " AND season=?"; params.append(season)
        perf = rows_to_list(conn.execute(sql, params).fetchall())
        att  = rows_to_list(conn.execute(
            "SELECT * FROM attendance WHERE player_id=?" + (" AND strftime('%Y',session_date)>=?" if season else ""),
            [player_id] + ([season[:4]] if season else [])
        ).fetchall())

    if not player:
        return jsonify({"error": "Player not found"}), 404

    goals       = sum(r.get("goals",0) or 0 for r in perf)
    assists     = sum(r.get("assists",0) or 0 for r in perf)
    appearances = len(perf)
    att_pct     = round(100 * sum(1 for a in att if a.get("present")) / len(att), 1) if att else 0
    avg_rating  = round(sum(r.get("rating") or 0 for r in perf if r.get("rating")) / max(len([r for r in perf if r.get("rating")]),1), 2)

    return jsonify({
        "player":      player,
        "season":      season or "all",
        "appearances": appearances,
        "goals":       goals,
        "assists":     assists,
        "att_pct":     att_pct,
        "avg_rating":  avg_rating,
        "perf_records": perf,
    })




# ══════════════════════════════════════════════════════════════
# OLLAMA — LOCAL AI
# ══════════════════════════════════════════════════════════════

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2"

def ollama_ask(prompt: str, system: str = "") -> str:
    import urllib.request
    payload = json.dumps({
        "model":  OLLAMA_MODEL,
        "prompt": prompt,
        "system": system,
        "stream": False,
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            OLLAMA_URL, data=payload,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("response", "").strip()
    except Exception as e:
        return f"ERROR: {e}"


@app.post("/api/ai/log-match")
@require_admin
def ai_log_match():
    d           = request.get_json(silent=True) or {}
    description = str(d.get("description", "")).strip()
    season      = str(d.get("season", "2024-25")).strip()
    if not description:
        return jsonify({"error": "description is required"}), 400

    with db() as conn:
        players = rows_to_list(conn.execute("SELECT id, name, position FROM players").fetchall())

    player_list = "\n".join(f"- {p['id']}: {p['name']} ({p['position'] or 'unknown'})" for p in players)

    system = "You are a football data extraction assistant. Respond ONLY with a valid JSON array. No explanation, no markdown, no extra text."
    prompt = f"""Known players:
{player_list}

Season: {season}
Today: {datetime.now().strftime('%Y-%m-%d')}

Match description: "{description}"

Extract each player's performance. Return a JSON array where each object has:
player_id, player_name, opponent, match_date (YYYY-MM-DD), match_type (league/cup/friendly),
goals (int), assists (int), minutes (int, default 90), rating (float 1-10 or null), notes (string)

Respond with ONLY the JSON array."""

    raw = ollama_ask(prompt, system)
    try:
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start == -1 or end == 0:
            return jsonify({"error": "AI could not parse description", "raw": raw}), 422
        extracted = json.loads(raw[start:end])
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned invalid JSON", "raw": raw}), 422

    saved  = []
    errors = []
    for rec in extracted:
        pid = str(rec.get("player_id", "")).strip()
        if not pid:
            errors.append(f"No player ID for {rec.get('player_name','unknown')}"); continue
        record_id = f"PRF-AI-{datetime.now().strftime('%Y%m%d%H%M%S')}-{pid}"
        try:
            with db() as conn:
                conn.execute(
                    "INSERT INTO performance (id,player_id,season,match_date,opponent,match_type,goals,assists,minutes,rating,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (record_id, pid, season,
                     rec.get("match_date", datetime.now().strftime("%Y-%m-%d")),
                     rec.get("opponent",""), rec.get("match_type","league"),
                     int(rec.get("goals",0)), int(rec.get("assists",0)),
                     int(rec.get("minutes",90)), rec.get("rating"), rec.get("notes",""))
                )
            saved.append({"id": record_id, "player": rec.get("player_name"), "goals": rec.get("goals"), "assists": rec.get("assists")})
        except sqlite3.IntegrityError as e:
            errors.append(str(e))
    return jsonify({"saved": saved, "errors": errors})


@app.post("/api/ai/suggest-lineup")
@require_admin
def ai_suggest_lineup():
    d         = request.get_json(silent=True) or {}
    season    = str(d.get("season","2024-25")).strip()
    formation = str(d.get("formation","4-3-3")).strip()
    notes     = str(d.get("notes","")).strip()

    with db() as conn:
        players = rows_to_list(conn.execute(
            "SELECT id, name, position, status, squad_no FROM players WHERE status != 'inactive'"
        ).fetchall())
        perf = rows_to_list(conn.execute("""
            SELECT player_id, COUNT(*) as apps, SUM(goals) as goals,
                   SUM(assists) as assists, ROUND(AVG(rating),2) as avg_rating
            FROM performance WHERE season=? GROUP BY player_id
        """, (season,)).fetchall())

    perf_map = {r["player_id"]: r for r in perf}
    lines = []
    for p in players:
        s    = perf_map.get(p["id"], {})
        flag = f"UNAVAILABLE ({p['status']})" if p["status"] in ("injured","suspended") else "Available"
        lines.append(f"- {p['name']} | {p['position'] or '?'} | {flag} | Apps:{s.get('apps',0)} G:{s.get('goals',0)} A:{s.get('assists',0)} Rating:{s.get('avg_rating','N/A')}")

    system = "You are an experienced football coach analyst for Lumen FC. Suggest the best lineup based on player data. Never select injured or suspended players as starters."
    prompt = f"""Formation: {formation} | Season: {season}{f' | Notes: {notes}' if notes else ''}

Squad:
{chr(10).join(lines)}

Suggest:
1. Best starting 11 in {formation} formation with positions
2. 3-5 substitutes
3. 2-3 sentences on key selection decisions
4. Any concerns with this lineup"""

    response = ollama_ask(prompt, system)
    if response.startswith("ERROR:"):
        return jsonify({"error": response}), 500
    return jsonify({"formation": formation, "season": season, "suggestion": response})


@app.get("/api/ai/contract-intelligence")
@require_admin
def ai_contract_intelligence():
    days_ahead = int(request.args.get("days", 60))
    season     = request.args.get("season", "2024-25")
    cutoff     = datetime.now().strftime("%Y-%m-%d")

    with db() as conn:
        expiring = rows_to_list(conn.execute("""
            SELECT m.*, p.name as player_name, p.position, p.squad_no, p.status as player_status
            FROM memberships m JOIN players p ON m.player_id=p.id
            WHERE m.expiry_date IS NOT NULL AND m.expiry_date != ''
              AND m.expiry_date <= date(?, '+'||?||' days')
              AND m.expiry_date >= ? AND m.status='active'
            ORDER BY m.expiry_date ASC
        """, (cutoff, days_ahead, cutoff)).fetchall())

        expiring_ids = [r["player_id"] for r in expiring]
        perf_rows = []
        if expiring_ids:
            ph = ",".join("?"*len(expiring_ids))
            perf_rows = rows_to_list(conn.execute(f"""
                SELECT player_id, COUNT(*) as apps, SUM(goals) as goals,
                       SUM(assists) as assists, ROUND(AVG(rating),2) as avg_rating
                FROM performance WHERE player_id IN ({ph}) AND season=?
                GROUP BY player_id
            """, expiring_ids+[season]).fetchall())

    if not expiring:
        return jsonify({"message": f"No contracts expiring in the next {days_ahead} days.", "expiring": [], "recommendations": ""})

    perf_map = {r["player_id"]: r for r in perf_rows}
    summaries = []
    for m in expiring:
        s = perf_map.get(m["player_id"], {})
        summaries.append(f"- {m['player_name']} | {m['position'] or '?'} | Expires:{m['expiry_date']} | Fee:£{m['fee_paid']}/£{m['fee_due']} | Apps:{s.get('apps',0)} G:{s.get('goals',0)} A:{s.get('assists',0)} Rating:{s.get('avg_rating','N/A')}")

    system = "You are a football club administrator. Review expiring memberships and give clear renewal recommendations. Be concise and practical."
    prompt = f"""Memberships expiring in {days_ahead} days:
{chr(10).join(summaries)}

For each player give:
1. Recommendation: Renew / Renew with conditions / Do not renew
2. Suggested fee for next season
3. One sentence justification"""

    return jsonify({"days_ahead": days_ahead, "expiring_count": len(expiring), "expiring": expiring, "recommendations": ollama_ask(prompt, system)})


@app.post("/api/ai/chat")
def ai_chat():
    d       = request.get_json(silent=True) or {}
    message = str(d.get("message","")).strip()
    if not message:
        return jsonify({"error": "message required"}), 400

    with db() as conn:
        player_count = conn.execute("SELECT COUNT(*) as c FROM players").fetchone()["c"]

    system = f"""You are FootBot, the AI assistant for Lumen FC — a local football club.
You have a knowledge base with {len(ENTRIES)} entries and {player_count} registered players.
Answer helpfully and concisely. You run entirely on the user's local machine — no data leaves their system."""

    response = ollama_ask(message, system)
    if response.startswith("ERROR:"):
        return jsonify({"answer": "Local AI unavailable right now. Try rephrasing or type help.", "src_info": "AI unavailable"})
    return jsonify({"answer": response, "src_info": "Local AI (Ollama llama3.2)"})


# ══════════════════════════════════════════════════════════════
# BOOT
# ══════════════════════════════════════════════════════════════

init_db()

if __name__ == "__main__":
    app.run(debug=True)