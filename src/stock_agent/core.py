from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class Role(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class ResponseStyle(str, Enum):
    BRIEF = "brief"
    STRUCTURED = "structured"
    DEEP = "deep"


@dataclass
class ConversationMessage:
    role: Role
    content: str
    name: Optional[str] = None


@dataclass
class AnalysisRequest:
    user_question: str
    symbol: Optional[str] = None
    mode: str = "chat"
    time_horizon: Optional[str] = None
    position_state: Optional[str] = None
    risk_profile: Optional[str] = None
    style: ResponseStyle = ResponseStyle.STRUCTURED
    memory: List[ConversationMessage] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AnalysisResponse:
    answer: str
    stance: Optional[str] = None
    confidence: Optional[float] = None
    missing_info: List[str] = field(default_factory=list)
    next_actions: List[str] = field(default_factory=list)
    raw_output: Any = None


class LLMProvider:
    def complete(self, messages: List[ConversationMessage], **kwargs: Any) -> str:
        raise NotImplementedError


class MasterOrchestrator:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider

    def build_messages(self, request: AnalysisRequest) -> List[ConversationMessage]:
        system_prompt = (
            "You are the master controller of a stock decision assistant. "
            "Be concise, structured, and explicit about uncertainty. "
            "Never invent market facts. If data is missing, ask for it."
        )
        context_lines = [
            f"mode: {request.mode}",
            f"symbol: {request.symbol or ''}",
            f"time_horizon: {request.time_horizon or ''}",
            f"position_state: {request.position_state or ''}",
            f"risk_profile: {request.risk_profile or ''}",
            f"response_style: {request.style.value}",
        ]
        context_block = "\n".join(context_lines)

        messages = [ConversationMessage(role=Role.SYSTEM, content=system_prompt)]
        messages.extend(request.memory)
        messages.append(
            ConversationMessage(
                role=Role.SYSTEM,
                content=f"Structured context:\n{context_block}",
            )
        )
        messages.append(ConversationMessage(role=Role.USER, content=request.user_question))
        return messages

    def answer(self, request: AnalysisRequest) -> AnalysisResponse:
        messages = self.build_messages(request)
        raw = self.provider.complete(messages, request=request)
        return AnalysisResponse(answer=raw, raw_output=raw)
