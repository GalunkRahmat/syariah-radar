"""
Authentication Module for Syariah Swing Radar Pro
Provides secure password hashing, user authentication, and persistent session management.
"""

import os
import time
import json
import secrets
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
USERS_FILE = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"

SESSION_DURATION = 30 * 24 * 3600  # 30 days persistent session


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hashes password with SHA-256 and unique salt."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return hashed, salt


def load_users() -> Dict[str, Any]:
    """Loads users database from disk or initializes default user Galunk."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if USERS_FILE.exists():
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # Initialize default user Galunk
    default_pass = "8924641@Ok"
    hashed, salt = hash_password(default_pass)
    users = {
        "galunk": {
            "username": "Galunk",
            "hash": hashed,
            "salt": salt,
            "created_at": time.time()
        }
    }
    save_users(users)
    return users


def save_users(users: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def load_sessions() -> Dict[str, Any]:
    """Loads active sessions and purges expired ones."""
    if SESSIONS_FILE.exists():
        try:
            with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                sessions = json.load(f)
                now = time.time()
                # Clean expired
                active = {k: v for k, v in sessions.items() if v.get("expires_at", 0) > now}
                return active
        except Exception:
            pass
    return {}


def save_sessions(sessions: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(sessions, f, indent=2)


def authenticate_user(username: str, password: str) -> Optional[str]:
    """Authenticates username and password. Returns username on success, None on failure."""
    users = load_users()
    key = username.strip().lower()
    user_data = users.get(key)
    if not user_data:
        return None

    salt = user_data["salt"]
    expected_hash = user_data["hash"]
    computed_hash, _ = hash_password(password, salt)

    if secrets.compare_digest(computed_hash, expected_hash):
        return user_data["username"]
    return None


def create_session(username: str) -> str:
    """Generates a secure session token valid for 30 days."""
    sessions = load_sessions()
    token = secrets.token_hex(32)
    sessions[token] = {
        "username": username,
        "created_at": time.time(),
        "expires_at": time.time() + SESSION_DURATION
    }
    save_sessions(sessions)
    return token


def verify_session(token: Optional[str]) -> Optional[str]:
    """Checks if token is valid and unexpired. Returns username or None."""
    if not token:
        return None
    sessions = load_sessions()
    session = sessions.get(token)
    if not session:
        return None
    if session.get("expires_at", 0) < time.time():
        return None
    return session.get("username")


def revoke_session(token: str) -> bool:
    """Removes a session token (logout)."""
    sessions = load_sessions()
    if token in sessions:
        del sessions[token]
        save_sessions(sessions)
        return True
    return False


# Auto-initialize user on import
load_users()
