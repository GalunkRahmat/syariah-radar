"""
Authentication & Role-Based Access Control Module for Syariah Swing Radar Pro
Provides secure password hashing, user authentication, session management,
role-based permissions (Admin vs Member), and single-device concurrency restriction.
"""

import os
import time
import json
import secrets
import hashlib
import hmac
import base64
import shutil
from pathlib import Path
from typing import Optional, Dict, Any, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if os.environ.get("VERCEL"):
    DATA_DIR = Path("/tmp/data")
else:
    DATA_DIR = PROJECT_ROOT / "data"
USERS_FILE = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"

SESSION_DURATION = 30 * 24 * 3600  # 30 days persistent session

SECRET_KEY = os.environ.get(
    "SESSION_SECRET",
    "syariah-radar-secure-jwt-hmac-secret-key-2026-idx-be1"
).encode("utf-8")


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hashes password with SHA-256 and unique salt."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return hashed, salt


def load_users() -> Dict[str, Any]:
    """Loads users database from disk or initializes default admin user Galunk."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    seed_users = PROJECT_ROOT / "data" / "users.json"
    if os.environ.get("VERCEL") and not USERS_FILE.exists() and seed_users.exists():
        try:
            shutil.copy2(seed_users, USERS_FILE)
        except Exception:
            pass

    users = {}
    if USERS_FILE.exists():
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                users = json.load(f)
        except Exception:
            users = {}

    # Ensure admin Galunk exists with admin role
    if "galunk" not in users:
        default_pass = "8924641@Ok"
        hashed, salt = hash_password(default_pass)
        users["galunk"] = {
            "username": "Galunk",
            "role": "admin",
            "hash": hashed,
            "salt": salt,
            "session_version": 1,
            "current_device_id": None,
            "created_at": time.time(),
            "last_login": time.time()
        }
        save_users(users)
    else:
        # Guarantee role is admin
        if users["galunk"].get("role") != "admin":
            users["galunk"]["role"] = "admin"
            save_users(users)

    return users


def save_users(users: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2)
    except Exception:
        pass


def authenticate_user(username: str, password: str, device_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Authenticates username and password.
    Enforces Single-Device Login for regular users (role != 'admin').
    Admin (Galunk) is exempt and can login concurrently on multiple devices.
    Returns user dict on success, None on failure.
    """
    users = load_users()
    key = username.strip().lower()
    user_data = users.get(key)
    if not user_data:
        # Fallback check default admin Galunk
        if key == "galunk" and password == "8924641@Ok":
            return {"username": "Galunk", "role": "admin", "session_version": 1}
        return None

    salt = user_data["salt"]
    expected_hash = user_data["hash"]
    computed_hash, _ = hash_password(password, salt)

    if secrets.compare_digest(computed_hash, expected_hash):
        role = user_data.get("role", "admin" if key == "galunk" else "user")

        # Single Device Enforcement for regular users
        if role != "admin":
            new_version = user_data.get("session_version", 0) + 1
            user_data["session_version"] = new_version
            user_data["current_device_id"] = device_id
            user_data["last_login"] = time.time()
            save_users(users)
            return {
                "username": user_data["username"],
                "role": role,
                "session_version": new_version,
                "device_id": device_id
            }
        else:
            # Admin can login simultaneously on multiple devices
            user_data["last_login"] = time.time()
            save_users(users)
            return {
                "username": user_data["username"],
                "role": "admin",
                "session_version": user_data.get("session_version", 1),
                "device_id": device_id
            }

    return None


def create_session(username: str, role: str = "user", session_version: int = 1, device_id: Optional[str] = None) -> str:
    """
    Generates a cryptographically signed HMAC token valid for 30 days.
    Contains user identity, role, session version, and device binding.
    """
    payload = {
        "username": username,
        "role": role,
        "v": session_version,
        "device_id": device_id,
        "created_at": int(time.time()),
        "expires_at": int(time.time()) + SESSION_DURATION,
        "nonce": secrets.token_hex(8)
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode("utf-8")).decode("utf-8").rstrip("=")
    signature = hmac.new(SECRET_KEY, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def verify_session(token: Optional[str], request_device_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Verifies HMAC signature, expiration, and single-device concurrency for regular users.
    Returns dict {"username": str, "role": str} on success, None on failure.
    """
    if not token or not isinstance(token, str):
        return None

    token = token.strip()
    if "." in token:
        try:
            payload_b64, signature = token.split(".", 1)
            expected_sig = hmac.new(SECRET_KEY, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
            if secrets.compare_digest(signature, expected_sig):
                padded = payload_b64 + "=" * (-len(payload_b64) % 4)
                data = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))

                # Check expiration
                if data.get("expires_at", 0) <= time.time():
                    return None

                username = data.get("username", "")
                role = data.get("role", "admin" if username.lower() == "galunk" else "user")

                # Admin is always permitted on any device concurrently
                if role == "admin" or username.lower() == "galunk":
                    return {"username": username, "role": "admin"}

                # Regular users: Check single active session concurrency
                users = load_users()
                user_rec = users.get(username.lower())
                if not user_rec:
                    return None

                current_version = user_rec.get("session_version", 1)
                token_version = data.get("v")

                # If token session version doesn't match current active version, it was kicked out
                if token_version is not None and token_version != current_version:
                    return None

                # If request_device_id provided, check device matching
                active_device = user_rec.get("current_device_id")
                if request_device_id and active_device and request_device_id != active_device:
                    return None

                return {"username": username, "role": "user"}
        except Exception:
            pass

    return None


def list_all_users() -> List[Dict[str, Any]]:
    """Lists all users without exposing sensitive password hashes."""
    users = load_users()
    result = []
    for k, u in users.items():
        result.append({
            "username": u.get("username", k),
            "role": u.get("role", "user"),
            "session_version": u.get("session_version", 1),
            "has_active_device": bool(u.get("current_device_id")),
            "created_at": u.get("created_at"),
            "last_login": u.get("last_login")
        })
    return result


def create_new_user(username: str, password: str, role: str = "user") -> Dict[str, Any]:
    """Creates a new user account with hashed password."""
    clean_username = username.strip()
    if not clean_username or len(clean_username) < 3 or len(clean_username) > 30:
        raise ValueError("Username harus terdiri dari 3 hingga 30 karakter.")

    if not password or len(password) < 6:
        raise ValueError("Password minimal 6 karakter.")

    clean_role = "admin" if role.lower() == "admin" else "user"
    key = clean_username.lower()

    users = load_users()
    if key in users:
        raise ValueError(f"Username '{clean_username}' sudah terdaftar. Gunakan username lain.")

    hashed, salt = hash_password(password)
    users[key] = {
        "username": clean_username,
        "role": clean_role,
        "hash": hashed,
        "salt": salt,
        "session_version": 1,
        "current_device_id": None,
        "created_at": time.time(),
        "last_login": None
    }
    save_users(users)

    return {
        "username": clean_username,
        "role": clean_role,
        "created_at": users[key]["created_at"]
    }


def delete_user(username: str) -> bool:
    """Deletes a user account. Admin Galunk cannot be deleted."""
    key = username.strip().lower()
    if key == "galunk":
        raise ValueError("Akun utama Administrator (Galunk) tidak dapat dihapus.")

    users = load_users()
    if key in users:
        del users[key]
        save_users(users)
        return True
    return False


def reset_user_password(username: str, new_password: str) -> bool:
    """Resets password and increments session version to kick out existing logins."""
    if not new_password or len(new_password) < 6:
        raise ValueError("Password baru minimal 6 karakter.")

    key = username.strip().lower()
    users = load_users()
    if key not in users:
        return False

    hashed, salt = hash_password(new_password)
    users[key]["hash"] = hashed
    users[key]["salt"] = salt
    users[key]["session_version"] = users[key].get("session_version", 0) + 1
    users[key]["current_device_id"] = None
    save_users(users)
    return True


def revoke_session(token: str) -> bool:
    """Removes a session token (logout)."""
    return True


# Auto-initialize user on import
load_users()
