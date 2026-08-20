"""Hermes registration entry point for the Chamber plugin."""

from __future__ import annotations

import logging
from pathlib import Path

from .chamber.hooks import on_session_start

logger = logging.getLogger(__name__)
PLUGIN_ROOT = Path(__file__).resolve().parent


def register(ctx) -> None:
    """Register Chamber's mention-inbox hook and bundled communications skill."""
    ctx.register_hook("on_session_start", on_session_start)

    skill_path = PLUGIN_ROOT / "skills" / "comms" / "SKILL.md"
    try:
        ctx.register_skill(
            "chamber-comms",
            skill_path,
            "Communicate through Chamber workspaces, channels, threads, and mentions",
        )
    except TypeError:
        # Compatibility with older Hermes hosts lacking the description argument.
        ctx.register_skill("chamber-comms", skill_path)

    logger.info("chamber Hermes plugin registered")
