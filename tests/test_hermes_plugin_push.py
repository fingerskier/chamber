from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "plugins" / "hermes"
sys.path.insert(0, str(PLUGIN_ROOT))

from chamber.cli import configure_push  # noqa: E402  # pyright: ignore[reportMissingImports]


class FakeClient:
    def __init__(self) -> None:
        self.webhook_url: str | None = None

    def set_webhook(self, url: str) -> dict:
        self.webhook_url = url
        return {"webhookUrl": url}

    def me(self) -> dict:
        return {"webhookUrl": self.webhook_url}


class GuidedPushSetupTests(unittest.TestCase):
    def test_configures_signed_route_and_registers_callback(self) -> None:
        config: dict[str, str] = {}
        secrets: dict[str, str] = {}
        client = FakeClient()
        token = "test-token-value"

        result = configure_push(
            token=token,
            public_url="https://agent.example/webhooks/chamber/",
            set_config=config.__setitem__,
            save_secret=secrets.__setitem__,
            client=client,
        )

        self.assertEqual(result.public_url, "https://agent.example/webhooks/chamber")
        self.assertTrue(result.webhook_registered)
        self.assertEqual(client.webhook_url, result.public_url)
        self.assertEqual(
            secrets["CHAMBER_WEBHOOK_SECRET"],
            hashlib.sha256(token.encode()).hexdigest(),
        )
        self.assertEqual(
            config["platforms.webhook.extra.routes.chamber.secret"],
            "${CHAMBER_WEBHOOK_SECRET}",
        )
        self.assertEqual(config["platforms.webhook.enabled"], "true")
        self.assertIn("same Chamber thread", config["platforms.webhook.extra.routes.chamber.prompt"])
        self.assertNotIn(token, repr(config))

    def test_no_register_only_writes_local_configuration(self) -> None:
        config: dict[str, str] = {}
        secrets: dict[str, str] = {}

        result = configure_push(
            token="token",
            public_url="https://agent.example/custom/chamber",
            route="chamber_prod",
            port=9443,
            register_webhook=False,
            set_config=config.__setitem__,
            save_secret=secrets.__setitem__,
        )

        self.assertFalse(result.webhook_registered)
        self.assertEqual(result.local_health_url, "http://127.0.0.1:9443/health")
        self.assertIn("platforms.webhook.extra.routes.chamber_prod.secret", config)

    def test_base_public_url_gets_the_route_path(self) -> None:
        result = configure_push(
            token="token",
            public_url="https://agent.example/",
            route="chamber-prod",
            register_webhook=False,
            set_config=lambda _key, _value: None,
            save_secret=lambda _key, _value: None,
        )
        self.assertEqual(
            result.public_url,
            "https://agent.example/webhooks/chamber-prod",
        )

    def test_rejects_insecure_or_credentialed_callback_urls(self) -> None:
        for url in (
            "http://agent.example/webhooks/chamber",
            "https://user:pass@agent.example/webhooks/chamber",
            "https://agent.example/webhooks/chamber?secret=nope",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                configure_push(
                    token="token",
                    public_url=url,
                    set_config=lambda _key, _value: None,
                    save_secret=lambda _key, _value: None,
                )

    def test_requires_token_before_writing(self) -> None:
        writes: list[tuple[str, str]] = []
        with self.assertRaisesRegex(ValueError, "CHAMBER_TOKEN"):
            configure_push(
                token="",
                public_url="https://agent.example/webhooks/chamber",
                set_config=lambda key, value: writes.append((key, value)),
                save_secret=lambda key, value: writes.append((key, value)),
            )
        self.assertEqual(writes, [])


if __name__ == "__main__":
    unittest.main()
