"""
Shared, cross-process appData cache backed by SQLite.

All gunicorn workers read/write the SAME file, so a single Apps Script fetch
serves every worker instead of each worker downloading the (large) bundle
independently. Values are JSON-serializable appData tables.

Also provides a DB-backed "in-flight" lease so concurrent cold reads for the
same user coalesce into one fetch across processes.
"""
import json
import os
import tempfile
import threading
import time
import uuid

import sqlite3

_DB_PATH = os.getenv('APPDATA_CACHE_DB') or os.path.join(
    tempfile.gettempdir(), 'webfixx_appdata_cache.db'
)
_INIT_LOCK = threading.Lock()
_INITIALIZED = False
_INFLIGHT_STALE_S = int(os.getenv('APPDATA_INFLIGHT_STALE_S', '300'))


def _conn():
    c = sqlite3.connect(_DB_PATH, timeout=10)
    c.execute('PRAGMA busy_timeout=10000')
    return c


def _init():
    global _INITIALIZED
    if _INITIALIZED:
        return
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        c = _conn()
        try:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute(
                'CREATE TABLE IF NOT EXISTS app_cache '
                '(key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at REAL NOT NULL)'
            )
            c.execute(
                'CREATE TABLE IF NOT EXISTS app_inflight '
                '(user_id TEXT PRIMARY KEY, owner TEXT NOT NULL, started_at REAL NOT NULL)'
            )
            c.execute(
                'CREATE INDEX IF NOT EXISTS idx_app_cache_exp ON app_cache(expires_at)'
            )
            c.commit()
        finally:
            c.close()
        _INITIALIZED = True


def get(key):
    _init()
    c = _conn()
    try:
        row = c.execute(
            'SELECT value, expires_at FROM app_cache WHERE key=?', (key,)
        ).fetchone()
        if not row or row[1] <= time.time():
            return None
        try:
            return json.loads(row[0])
        except Exception:
            return None
    finally:
        c.close()


def set(key, value, ttl):
    _init()
    c = _conn()
    try:
        c.execute(
            'INSERT OR REPLACE INTO app_cache(key, value, expires_at) VALUES(?,?,?)',
            (key, json.dumps(value), time.time() + ttl),
        )
        c.commit()
    finally:
        c.close()


def delete_prefix(prefix):
    _init()
    c = _conn()
    try:
        c.execute('DELETE FROM app_cache WHERE key LIKE ?', (prefix + '%',))
        c.commit()
    finally:
        c.close()


def list_valid(prefix):
    """Return (suffix, value) for all non-expired keys starting with prefix."""
    _init()
    c = _conn()
    try:
        rows = c.execute(
            'SELECT key, value FROM app_cache WHERE key LIKE ? AND expires_at > ?',
            (prefix + '%', time.time()),
        ).fetchall()
        out = []
        for key, value in rows:
            suffix = key[len(prefix):]
            try:
                out.append((suffix, json.loads(value)))
            except Exception:
                continue
        return out
    finally:
        c.close()


def prune(max_rows=2000):
    _init()
    c = _conn()
    try:
        now = time.time()
        c.execute('DELETE FROM app_cache WHERE expires_at <= ?', (now,))
        count = c.execute('SELECT COUNT(*) FROM app_cache').fetchone()[0]
        if count > max_rows:
            c.execute(
                'DELETE FROM app_cache WHERE key IN '
                '(SELECT key FROM app_cache ORDER BY expires_at ASC LIMIT ?)',
                (count - max_rows,),
            )
        c.execute('DELETE FROM app_inflight WHERE started_at < ?', (now - _INFLIGHT_STALE_S,))
        c.commit()
    finally:
        c.close()


def acquire_inflight(user_id):
    """Return a unique owner token if this caller acquired the lease, else None."""
    _init()
    c = _conn()
    try:
        now = time.time()
        c.execute('DELETE FROM app_inflight WHERE started_at < ?', (now - _INFLIGHT_STALE_S,))
        owner = f"{os.getpid()}:{uuid.uuid4().hex}"
        cur = c.execute(
            'INSERT OR IGNORE INTO app_inflight(user_id, owner, started_at) VALUES(?,?,?)',
            (user_id, owner, now),
        )
        c.commit()
        return owner if cur.rowcount == 1 else None
    finally:
        c.close()


def inflight_active(user_id):
    """True while another caller holds a (non-stale) lease for this user."""
    _init()
    c = _conn()
    try:
        row = c.execute(
            'SELECT started_at FROM app_inflight WHERE user_id=?', (user_id,)
        ).fetchone()
        return bool(row and row[0] > time.time() - _INFLIGHT_STALE_S)
    finally:
        c.close()


def release_inflight(user_id, owner):
    if not owner:
        return
    _init()
    c = _conn()
    try:
        c.execute(
            'DELETE FROM app_inflight WHERE user_id=? AND owner=?', (user_id, owner)
        )
        c.commit()
    finally:
        c.close()
