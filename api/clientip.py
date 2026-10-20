"""Real client IP resolution for traffic forwarded through Cloudflare.

When a request arrives via a Cloudflare Worker (workers.dev link), the TCP peer
(`request.remote_addr`) is a Cloudflare edge IP, not the visitor. Cloudflare's edge
sets the `CF-Connecting-IP` header to the visitor's real IP on every request that
enters their network — but a direct client could spoof that header, so it is only
trusted when the TCP peer actually belongs to Cloudflare's published IP ranges.

Direct traffic (peer not Cloudflare) behaves exactly as before: remote_addr is
returned and any CF-Connecting-IP header is ignored.
"""

import ipaddress
import logging
import threading
import time

import requests
from flask import request

logger = logging.getLogger(__name__)

_CF_RANGES_URL_V4 = "https://www.cloudflare.com/ips-v4"
_CF_RANGES_URL_V6 = "https://www.cloudflare.com/ips-v6"
_RANGES_REFRESH_SECONDS = 24 * 60 * 60

_lock = threading.Lock()
_networks = []
_fetched_at = 0.0


def _load_networks():
    """Fetch Cloudflare's published IP ranges (cached for 24h per process)."""
    global _networks, _fetched_at
    with _lock:
        now = time.time()
        if _networks and (now - _fetched_at) < _RANGES_REFRESH_SECONDS:
            return _networks
        try:
            nets = []
            for url in (_CF_RANGES_URL_V4, _CF_RANGES_URL_V6):
                text = requests.get(url, timeout=10).text
                for line in text.splitlines():
                    line = line.strip()
                    if line:
                        nets.append(ipaddress.ip_network(line))
            if nets:
                _networks = nets
                _fetched_at = now
            else:
                logger.warning("clientip: Cloudflare ranges list came back empty")
        except Exception as e:
            logger.warning("clientip: could not refresh Cloudflare ranges: %s", e)
        return _networks


def _peer_is_cloudflare(peer):
    if not peer:
        return False
    try:
        addr = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(addr in net for net in _load_networks())


def client_ip():
    """Visitor's real IP: CF-Connecting-IP when the peer is Cloudflare, else remote_addr."""
    peer = (request.remote_addr or '').strip()
    if _peer_is_cloudflare(peer):
        forwarded = (request.headers.get('CF-Connecting-IP') or '').strip()
        if forwarded:
            return forwarded
    return peer
