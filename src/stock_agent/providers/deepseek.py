from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, List, Optional

from ..core import ConversationMessage


@dataclass
class DeepSeekConfig:
    api_key: Optional[str] = None
    base_url: str = "https://api.deepseek.com"
    model: str = ""

    @classmethod
    def from_env(cls) -> "DeepSeekConfig":
        return cls(
            api_key=os.getenv("DEEPSEEK_API_KEY"),
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            model=os.getenv("DEEPSEEK_MODEL", ""),
        )


class DeepSeekProvider:
    def __init__(self, config: Optional[DeepSeekConfig] = None) -> None:
        self.config = config or DeepSeekConfig.from_env()

    def complete(self, messages: List[ConversationMessage], **kwargs: Any) -> str:
        if not self.config.api_key:
            raise RuntimeError(
                "DeepSeek API key is missing. Set DEEPSEEK_API_KEY before calling complete()."
            )
        if not self.config.model:
            raise RuntimeError(
                "DeepSeek model is missing. Set DEEPSEEK_MODEL before calling complete()."
            )

        payload = {
            "model": self.config.model,
            "messages": [
                {
                    "role": message.role.value,
                    "content": message.content,
                    **({"name": message.name} if message.name else {}),
                }
                for message in messages
            ],
        }

        request = urllib.request.Request(
            url=self.config.base_url.rstrip("/") + "/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"DeepSeek API error {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"DeepSeek API connection error: {exc.reason}") from exc

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("DeepSeek API returned no choices.")

        message = choices[0].get("message") or {}
        content = message.get("content")
        if content is None:
            return ""
        return content
