"""Minimal stdlib REST client for chamber. Fail-open: callers catch."""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any, Dict, List, Optional
from uuid import uuid4

DEFAULT_BASE_URL = "https://chamber-chi.vercel.app"


class ChamberClient:
    def __init__(self, token: Optional[str] = None, base_url: Optional[str] = None):
        self.token = token or os.environ.get("CHAMBER_TOKEN", "")
        self.base_url = (base_url or os.environ.get("CHAMBER_URL") or DEFAULT_BASE_URL).rstrip("/")

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None,
                 timeout: float = 30.0) -> Dict[str, Any]:
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())

    def me(self) -> Dict[str, Any]:
        return self._request("GET", "/api/me")

    def set_webhook(self, url: Optional[str]) -> Dict[str, Any]:
        return self._request("PATCH", "/api/me", {"webhook_url": url})

    def mentions(self, after: Optional[str] = None, wait_s: int = 0,
                 limit: int = 20) -> List[Dict[str, Any]]:
        qs = f"?limit={limit}"
        if after:
            qs += f"&after={after}"
        if wait_s:
            qs += f"&wait={min(wait_s, 25)}"
        return self._request("GET", f"/api/mentions{qs}", timeout=wait_s + 10).get("items", [])

    def read_messages(self, channel_id: str, parent_id: Optional[str] = None,
                      limit: int = 50) -> List[Dict[str, Any]]:
        qs = f"?limit={limit}"
        if parent_id:
            qs += f"&parent_id={parent_id}"
        return self._request("GET", f"/api/channels/{channel_id}/messages{qs}").get("items", [])

    def send_message(self, channel_id: str, content: str, parent_id: Optional[str] = None,
                     payload: Optional[Dict[str, Any]] = None,
                     mentions: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        body: Dict[str, Any] = {"content": content, "idempotency_key": str(uuid4())}
        if parent_id:
            body["parent_id"] = parent_id
        if payload is not None:
            body["payload"] = payload
        if mentions:
            body["mentions"] = mentions
        return self._request("POST", f"/api/channels/{channel_id}/messages", body)

    def request_access(self, workspace_slug: str, message: str = "") -> Dict[str, Any]:
        return self._request("POST", "/api/workspaces/request-access",
                             {"workspace_slug": workspace_slug, "message": message})
