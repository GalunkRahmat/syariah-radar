"""
Authentication & Role-Based Access Control Module for Syariah Swing Radar Pro
Provides secure password hashing, user authentication, session management,
role-based permissions (Admin vs Member), single-device concurrency restriction,
and Membership Expiry Management (Masa Aktif Akun Member).
"""

import os
import time
import json
import math
import secrets
import hashlib
import hmac
import base64
import shutil
import datetime
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

MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


class AccountExpiredError(Exception):
    """Raised when an account's membership period has expired."""
    def __init__(self, message: str, expiry_str: str):
        super().__init__(message)
        self.expiry_str = expiry_str


def format_expiry_date(ts: Optional[float]) -> str:
    """Formats an epoch timestamp into readable Indonesian date: e.g. '17 Nov 2026'."""
    if not ts:
        return "Selamanya (Lifetime)"
    dt = datetime.datetime.fromtimestamp(ts)
    return f"{dt.day} {MONTHS_ID[dt.month - 1]} {dt.year}"


def get_user_expiry_info(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """Computes membership expiry status, remaining days, and display string."""
    role = user_data.get("role", "user")
    is_admin = (role == "admin" or user_data.get("username", "").lower() == "galunk")
    expires_at = user_data.get("expires_at")

    if is_admin or expires_at is None or expires_at == 0:
        return {
            "expires_at": None,
            "is_lifetime": True,
            "is_expired": False,
            "days_remaining": None,
            "expiry_str": "Selamanya (Lifetime)"
        }

    now = time.time()
    is_expired = (now > expires_at)
    days_left = max(0, math.ceil((expires_at - now) / 86400)) if not is_expired else 0

    return {
        "expires_at": expires_at,
        "is_lifetime": False,
        "is_expired": is_expired,
        "days_remaining": days_left,
        "expiry_str": format_expiry_date(expires_at)
    }


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

    # Ensure admin Galunk exists with admin role and lifetime access
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
            "last_login": time.time(),
            "expires_at": None
        }
        save_users(users)
    else:
        # Guarantee role is admin and expires_at is None
        changed = False
        if users["galunk"].get("role") != "admin":
            users["galunk"]["role"] = "admin"
            changed = True
        if users["galunk"].get("expires_at") is not None:
            users["galunk"]["expires_at"] = None
            changed = True
        if changed:
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
    Enforces membership validity (expires_at) and Single-Device Login for regular users.
    Admin (Galunk) is exempt and can login concurrently on multiple devices.
    Returns user dict with expiry details on success, None on credential mismatch.
    Raises AccountExpiredError if credentials are valid but membership has ended.
    """
    users = load_users()
    key = username.strip().lower()
    user_data = users.get(key)
    if not user_data:
        # Fallback check default admin Galunk
        if key == "galunk" and password == "8924641@Ok":
            return {
                "username": "Galunk",
                "role": "admin",
                "session_version": 1,
                "expires_at": None,
                "is_lifetime": True,
                "is_expired": False,
                "days_remaining": None,
                "expiry_str": "Selamanya (Lifetime)"
            }
        return None

    salt = user_data["salt"]
    expected_hash = user_data["hash"]
    computed_hash, _ = hash_password(password, salt)

    if secrets.compare_digest(computed_hash, expected_hash):
        role = user_data.get("role", "admin" if key == "galunk" else "user")
        expiry_info = get_user_expiry_info(user_data)

        # Check membership expiration for non-admin members
        if role != "admin" and expiry_info["is_expired"]:
            raise AccountExpiredError(
                f"Masa aktif akun Anda telah berakhir pada {expiry_info['expiry_str']}. Silakan hubungi Admin untuk perpanjangan akses.",
                expiry_info["expiry_str"]
            )

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
                "device_id": device_id,
                **expiry_info
            }
        else:
            # Admin can login simultaneously on multiple devices
            user_data["last_login"] = time.time()
            save_users(users)
            return {
                "username": user_data["username"],
                "role": "admin",
                "session_version": user_data.get("session_version", 1),
                "device_id": device_id,
                **expiry_info
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
    Verifies HMAC signature, expiration, membership expiry, and single-device concurrency for regular users.
    Returns dict with user details and expiry info on success, None on failure or expired membership.
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

                # Check token expiration
                if data.get("expires_at", 0) <= time.time():
                    return None

                username = data.get("username", "")
                role = data.get("role", "admin" if username.lower() == "galunk" else "user")

                # Admin is always permitted on any device concurrently
                if role == "admin" or username.lower() == "galunk":
                    return {
                        "username": username,
                        "role": "admin",
                        "expires_at": None,
                        "is_lifetime": True,
                        "is_expired": False,
                        "days_remaining": None,
                        "expiry_str": "Selamanya (Lifetime)"
                    }

                # Regular users: Check single active session concurrency & membership expiry
                users = load_users()
                user_rec = users.get(username.lower())
                if not user_rec:
                    return None

                # Check membership expiry
                expiry_info = get_user_expiry_info(user_rec)
                if expiry_info["is_expired"]:
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

                return {
                    "username": username,
                    "role": "user",
                    **expiry_info
                }
        except Exception:
            pass

    return None


def list_all_users() -> List[Dict[str, Any]]:
    """Lists all users with membership expiry, remaining days, and device status."""
    users = load_users()
    result = []
    for k, u in users.items():
        exp_info = get_user_expiry_info(u)
        result.append({
            "username": u.get("username", k),
            "role": u.get("role", "user"),
            "session_version": u.get("session_version", 1),
            "has_active_device": bool(u.get("current_device_id")),
            "created_at": u.get("created_at"),
            "last_login": u.get("last_login"),
            **exp_info
        })
    return result


def create_new_user(username: str, password: str, role: str = "user", duration_days: Optional[int] = 30) -> Dict[str, Any]:
    """Creates a new user account with hashed password and membership duration."""
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

    # Compute expires_at (if admin or duration <= 0, lifetime access)
    expires_at = None
    if clean_role != "admin" and duration_days is not None and int(duration_days) > 0:
        expires_at = time.time() + (int(duration_days) * 86400)

    users[key] = {
        "username": clean_username,
        "role": clean_role,
        "hash": hashed,
        "salt": salt,
        "session_version": 1,
        "current_device_id": None,
        "created_at": time.time(),
        "last_login": None,
        "expires_at": expires_at
    }
    save_users(users)

    exp_info = get_user_expiry_info(users[key])
    return {
        "username": clean_username,
        "role": clean_role,
        "created_at": users[key]["created_at"],
        **exp_info
    }


def update_user_expiry(username: str, duration_days: Optional[int] = 30, mode: str = "add") -> Dict[str, Any]:
    """
    Updates or extends membership expiry for a user.
    mode: 'add' (adds duration to current expiry if active, or from now if expired),
          'set' (sets expiry from now + duration_days),
          'lifetime' (sets expires_at to None for permanent access)
    """
    key = username.strip().lower()
    users = load_users()
    if key not in users:
        raise ValueError(f"Pengguna '{username}' tidak ditemukan.")

    if key == "galunk":
        raise ValueError("Akun Administrator (Galunk) selalu memiliki akses Lifetime.")

    if mode == "lifetime" or duration_days is None or int(duration_days) <= 0:
        users[key]["expires_at"] = None
    elif mode == "add":
        now = time.time()
        current_exp = users[key].get("expires_at")
        if current_exp and current_exp > now:
            users[key]["expires_at"] = current_exp + (int(duration_days) * 86400)
        else:
            users[key]["expires_at"] = now + (int(duration_days) * 86400)
    elif mode == "set":
        users[key]["expires_at"] = time.time() + (int(duration_days) * 86400)
    else:
        raise ValueError(f"Mode perpanjangan '{mode}' tidak dikenal.")

    save_users(users)
    exp_info = get_user_expiry_info(users[key])
    return {
        "username": users[key]["username"],
        "role": users[key].get("role", "user"),
        **exp_info
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
