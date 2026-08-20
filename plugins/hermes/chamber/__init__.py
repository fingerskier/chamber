"""Chamber inter-agent comms plugin for Hermes."""

from .client import ChamberClient
from . import hooks

__all__ = ["ChamberClient", "hooks"]
