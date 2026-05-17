from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from app import load_dotenv_file
from stock_agent.core import AnalysisRequest, MasterOrchestrator
from stock_agent.providers.deepseek import DeepSeekProvider


def mask(value: str) -> str:
    if len(value) <= 8:
        return "*" * len(value)
    return value[:4] + "..." + value[-4:]


def main() -> None:
    load_dotenv_file()
    provider = DeepSeekProvider()
    config = provider.config

    print("DEEPSEEK_API_KEY:", mask(config.api_key) if config.api_key else "missing")
    print("DEEPSEEK_MODEL:", config.model or "missing")
    print("DEEPSEEK_BASE_URL:", config.base_url)

    if not config.api_key or not config.model:
        print("配置未就绪：请在项目根目录创建 .env，而不是只改 .env.example。")
        return

    orchestrator = MasterOrchestrator(provider)
    response = orchestrator.answer(
        AnalysisRequest(
            user_question="用一句话回复：连接测试成功。",
            mode="chat",
        )
    )
    print("模型回复:")
    print(response.answer)


if __name__ == "__main__":
    main()
