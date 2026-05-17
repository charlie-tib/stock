from __future__ import annotations

from .core import AnalysisRequest, MasterOrchestrator, ResponseStyle
from .providers.deepseek import DeepSeekProvider


def demo() -> None:
    provider = DeepSeekProvider()
    orchestrator = MasterOrchestrator(provider)
    request = AnalysisRequest(
        user_question="明天盘前怎么看这只票？",
        symbol="600519",
        mode="pre_market",
        time_horizon="short_term",
        risk_profile="medium",
        style=ResponseStyle.STRUCTURED,
    )
    print(orchestrator.answer(request).answer)


if __name__ == "__main__":
    demo()
