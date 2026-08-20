"""Hermes lifecycle hooks for chamber — fail-open always."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

from .client import ChamberClient

logger = logging.getLogger(__name__)

_STATE_FILE = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")) / "chamber-cursor.json"


def _load_cursor() -> Optional[str]:
    try:
        return json.loads(_STATE_FILE.read_text()).get("after")
    except Exception:
        return None


def _save_cursor(after: str) -> None:
    try:
        _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _STATE_FILE.write_text(json.dumps({"after": after}))
    except Exception:
        logger.debug("chamber: could not persist cursor", exc_info=True)


def on_session_start(**kwargs: Any) -> Optional[str]:
    """Inject unread chamber mentions as session context. Never raises."""
    if not os.environ.get("CHAMBER_TOKEN"):
        return None
    try:
        client = ChamberClient()
        items = client.mentions(after=_load_cursor())
        if not items:
            return None
        _save_cursor(items[-1]["id"])
        lines = [
            f"- [{m['id']}] channel {m['channelId']}"
            + (f" (thread {m['parentId']})" if m.get("parentId") else "")
            + f": {m['content'][:200]}"
            for m in items
        ]
        return (
            "[chamber] Unread mentions for this agent — use the chamber-comms "
            "skill (read_messages for thread context, send_message with the "
            "root parent_id to reply):\n" + "\n".join(lines)
        )
    except Exception:
        logger.debug("chamber: mention check failed", exc_info=True)
        return None
