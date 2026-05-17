from __future__ import annotations

import json
import os
import sys
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from stock_agent.core import (
    AnalysisRequest,
    ConversationMessage,
    MasterOrchestrator,
    Role,
    ResponseStyle,
)
from stock_agent.providers.deepseek import DeepSeekProvider


HOST = "127.0.0.1"
PORT = int(os.getenv("PORT", "8000"))
APP_TITLE = "Stock Agent Chat"
STORAGE_HINT = "stock-agent-demo"


def load_dotenv_file() -> None:
    path = Path(".env")
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def build_page() -> bytes:
    html = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#1f6feb" />
  <title>__APP_TITLE__</title>
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <style>
    :root {{
      color-scheme: light;
      --bg: #f3f5f7;
      --panel: #ffffff;
      --border: #d9e0e8;
      --text: #132033;
      --muted: #667085;
      --accent: #1f6feb;
      --accent-strong: #1558c0;
      --chip: #edf2f7;
      --chip-active: #dbeafe;
      --user: #e8f1ff;
      --assistant: #f5f7fa;
    }}
    * {{ box-sizing: border-box; }}
    html, body {{ height: 100%; }}
    body {{
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
      background: var(--bg);
      color: var(--text);
    }}
    .app {{
      max-width: 880px;
      margin: 0 auto;
      min-height: 100%;
      padding: 12px;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 10px;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }}
    .title {{
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
    }}
    .meta, .status {{
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }}
    .toolbar {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }}
    .chip, button {{
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
    }}
    .chip {{
      background: var(--chip);
      color: var(--text);
    }}
    .chip.active {{
      background: var(--chip-active);
      color: var(--accent-strong);
      font-weight: 700;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
    }}
    details summary {{
      cursor: pointer;
      list-style: none;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 8px;
    }}
    details summary::-webkit-details-marker {{
      display: none;
    }}
    .grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }}
    label {{
      display: grid;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
    }}
    input, select, textarea {{
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 11px 12px;
      background: #fff;
      color: var(--text);
      font: inherit;
    }}
    textarea {{
      min-height: 76px;
      resize: none;
    }}
    .chat {{
      overflow: auto;
      display: grid;
      gap: 10px;
      align-content: start;
      padding: 2px 0;
    }}
    .msg {{
      max-width: 92%;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px 12px;
      white-space: pre-wrap;
      line-height: 1.55;
      word-break: break-word;
    }}
    .msg.user {{
      justify-self: end;
      background: var(--user);
    }}
    .msg.assistant {{
      justify-self: start;
      background: var(--assistant);
    }}
    .msg .role {{
      display: block;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 6px;
    }}
    .composer {{
      position: sticky;
      bottom: 0;
      background: linear-gradient(to top, rgba(243,245,247,0.98), rgba(243,245,247,0.7));
      padding-top: 4px;
    }}
    .composer-inner {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px;
      display: grid;
      gap: 8px;
      box-shadow: 0 8px 28px rgba(19, 32, 51, 0.04);
    }}
    .actions {{
      display: flex;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
    }}
    .primary {{
      background: var(--accent);
      color: #fff;
      font-weight: 700;
    }}
    .secondary {{
      background: #e9eef5;
      color: var(--text);
    }}
    .hint {{
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }}
    @media (max-width: 640px) {{
      .app {{
        padding: 10px;
        gap: 8px;
      }}
      .grid {{
        grid-template-columns: 1fr;
      }}
      .msg {{
        max-width: 100%;
      }}
      .title {{
        font-size: 17px;
      }}
    }}
  </style>
</head>
<body>
  <div class="app">
    <div class="header">
      <div>
        <div class="title">__APP_TITLE__</div>
        <div class="meta">手机优先的 PWA 聊天 demo</div>
      </div>
      <div class="meta" id="connection">等待输入</div>
    </div>
    <div class="toolbar" id="modeBar">
      <button class="chip active" type="button" data-mode="chat">聊天</button>
      <button class="chip" type="button" data-mode="pre_market">盘前</button>
      <button class="chip" type="button" data-mode="analysis">个股分析</button>
      <button class="chip" type="button" data-mode="review">复盘</button>
    </div>
    <details class="panel" open>
      <summary>会话参数</summary>
      <div class="grid">
        <label>代码 / 标的
          <input id="symbol" placeholder="例如 600519" />
        </label>
        <label>周期
          <select id="time_horizon">
            <option value="">未指定</option>
            <option value="intraday">日内</option>
            <option value="short_term">短线</option>
            <option value="swing">波段</option>
            <option value="long_term">中长线</option>
          </select>
        </label>
        <label>仓位状态
          <select id="position_state">
            <option value="">未指定</option>
            <option value="none">空仓</option>
            <option value="holding">持有</option>
            <option value="watching">观察中</option>
          </select>
        </label>
        <label>风险偏好
          <select id="risk_profile">
            <option value="">未指定</option>
            <option value="conservative">保守</option>
            <option value="medium">中性</option>
            <option value="aggressive">激进</option>
          </select>
        </label>
      </div>
      <div class="hint" style="margin-top:8px;">
        这些参数会一并送给总控模型，方便你用同一个入口问盘前、个股和复盘。
      </div>
    </details>
    <div class="panel chat" id="chat"></div>
    <div class="composer">
      <div class="composer-inner">
        <textarea id="question" placeholder="输入你的问题，例如：明天盘前怎么看 600519？"></textarea>
        <div class="actions">
          <div class="status" id="status"></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="secondary" id="clearBtn" type="button">清空</button>
            <button class="primary" id="sendBtn" type="button">发送</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const storageKey = '__STORAGE_HINT__';
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const messages = Array.isArray(saved.messages) ? saved.messages : [];
    const messagesEl = document.getElementById('chat');
    const statusEl = document.getElementById('status');
    const connectionEl = document.getElementById('connection');
    const questionEl = document.getElementById('question');
    const symbolEl = document.getElementById('symbol');
    const timeHorizonEl = document.getElementById('time_horizon');
    const positionStateEl = document.getElementById('position_state');
    const riskProfileEl = document.getElementById('risk_profile');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const modeBar = document.getElementById('modeBar');
    let mode = saved.mode || 'chat';

    symbolEl.value = saved.symbol || '';
    timeHorizonEl.value = saved.time_horizon || '';
    positionStateEl.value = saved.position_state || '';
    riskProfileEl.value = saved.risk_profile || '';

    function persist() {{
      localStorage.setItem(storageKey, JSON.stringify({{
        messages,
        mode,
        symbol: symbolEl.value.trim(),
        time_horizon: timeHorizonEl.value,
        position_state: positionStateEl.value,
        risk_profile: riskProfileEl.value,
      }}));
    }}

    function render() {{
      messagesEl.innerHTML = messages.length ? messages.map((msg) => `
        <div class="msg ${msg.role}">
          <span class="role">${msg.role === 'user' ? '你' : '总控 LLM'}</span>
          <div>${msg.content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>
        </div>
      `).join('') : '<div class="meta">先输入一句话开始对话。</div>';
      messagesEl.scrollTop = messagesEl.scrollHeight;
      [...modeBar.querySelectorAll('button')].forEach((btn) => {{
        btn.classList.toggle('active', btn.dataset.mode === mode);
      }});
      persist();
    }}

    function setStatus(text) {{
      statusEl.textContent = text;
    }}

    async function checkHealth() {{
      try {{
        const response = await fetch('/health');
        const data = await response.json();
        if (!response.ok || !data.ready) {{
          connectionEl.textContent = data.error || '配置未就绪';
          setStatus(data.hint || '请检查后端配置');
          return;
        }}
        connectionEl.textContent = '模型已连接';
      }} catch (error) {{
        connectionEl.textContent = '后端未连接';
        setStatus(error.message);
      }}
    }}

    async function sendMessage() {{
      const userQuestion = questionEl.value.trim();
      if (!userQuestion) return;

      messages.push({{ role: 'user', content: userQuestion }});
      render();
      questionEl.value = '';
      sendBtn.disabled = true;
      setStatus('正在请求模型...');
      connectionEl.textContent = '发送中';

      try {{
        const response = await fetch('/chat', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{
            user_question: userQuestion,
            symbol: symbolEl.value.trim(),
            mode,
            time_horizon: timeHorizonEl.value,
            position_state: positionStateEl.value,
            risk_profile: riskProfileEl.value,
            memory: messages.slice(0, -1).slice(-20),
          }})
        }});

        const data = await response.json();
        if (!response.ok) {{
          throw new Error(data.error || '请求失败');
        }}

        messages.push({{ role: 'assistant', content: data.answer }});
        render();
        setStatus('已完成');
        connectionEl.textContent = '可继续对话';
      }} catch (error) {{
        setStatus(error.message);
        connectionEl.textContent = '请求失败';
        messages.push({{ role: 'assistant', content: '请求失败：' + error.message }});
        render();
      }} finally {{
        sendBtn.disabled = false;
      }}
    }}

    modeBar.addEventListener('click', (event) => {{
      const button = event.target.closest('button[data-mode]');
      if (!button) return;
      mode = button.dataset.mode;
      render();
    }});

    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', () => {{
      messages.length = 0;
      render();
      setStatus('');
      connectionEl.textContent = '等待输入';
      persist();
    }});
    [symbolEl, timeHorizonEl, positionStateEl, riskProfileEl].forEach((el) => {{
      el.addEventListener('change', render);
    }});
    questionEl.addEventListener('keydown', (event) => {{
      if (event.key === 'Enter' && !event.shiftKey) {{
        event.preventDefault();
        sendMessage();
      }}
    }});
    render();
    checkHealth();

    if ('serviceWorker' in navigator) {{
      window.addEventListener('load', () => {{
        navigator.serviceWorker.register('/sw.js').catch(() => null);
      }});
    }}
  </script>
</body>
</html>"""
    return (
        html.replace("__APP_TITLE__", APP_TITLE)
        .replace("__STORAGE_HINT__", STORAGE_HINT)
        .encode("utf-8")
    )


def build_manifest() -> bytes:
    manifest = {
        "name": APP_TITLE,
        "short_name": "StockAgent",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "theme_color": "#1f6feb",
        "background_color": "#f3f5f7",
        "icons": [
            {
                "src": "/icon.svg",
                "sizes": "any",
                "type": "image/svg+xml",
                "purpose": "any maskable",
            }
        ],
    }
    return json.dumps(manifest, ensure_ascii=False).encode("utf-8")


def build_service_worker() -> bytes:
    script = """
const CACHE_NAME = 'stock-agent-pwa-v1';
const ASSETS = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
"""
    return script.encode("utf-8")


def build_icon_svg() -> bytes:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Stock Agent">
  <rect width="512" height="512" rx="112" fill="#1f6feb"/>
  <rect x="104" y="132" width="304" height="248" rx="28" fill="#ffffff"/>
  <path d="M156 310h44l34-74 38 54 30-48 54 68" fill="none" stroke="#1f6feb" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="168" cy="198" r="18" fill="#1f6feb"/>
</svg>"""
    return svg.encode("utf-8")


def to_conversation_messages(items: List[Dict[str, Any]]) -> List[ConversationMessage]:
    result: List[ConversationMessage] = []
    for item in items:
        role = item.get("role")
        content = item.get("content", "")
        if role not in ("user", "assistant", "system"):
            continue
        result.append(ConversationMessage(role=Role(role), content=str(content)))
    return result


class Handler(BaseHTTPRequestHandler):
    orchestrator = None

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            body = build_page()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/health":
            try:
                provider = DeepSeekProvider()
                config = provider.config
                if not config.api_key:
                    self._send_json(
                        200,
                        {
                            "ready": False,
                            "error": "DeepSeek API key 未读取到",
                            "hint": "请在项目根目录创建 .env，并填写 DEEPSEEK_API_KEY。",
                        },
                    )
                    return
                if not config.model:
                    self._send_json(
                        200,
                        {
                            "ready": False,
                            "error": "DeepSeek 模型未读取到",
                            "hint": "请在 .env 中填写 DEEPSEEK_MODEL。",
                        },
                    )
                    return
                self._send_json(
                    200,
                    {
                        "ready": True,
                        "model": config.model,
                        "base_url": config.base_url,
                    },
                )
            except Exception as exc:
                self._send_json(500, {"ready": False, "error": str(exc)})
            return
        if self.path == "/manifest.webmanifest":
            body = build_manifest()
            self.send_response(200)
            self.send_header("Content-Type", "application/manifest+json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/sw.js":
            body = build_service_worker()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/icon.svg":
            body = build_icon_svg()
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path != "/chat":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw or "{}")
        except Exception as exc:
            self._send_json(400, {"error": f"Invalid JSON: {exc}"})
            return

        try:
            if self.orchestrator is None:
                raise RuntimeError("Server is not ready")
            request = AnalysisRequest(
                user_question=str(payload.get("user_question", "")).strip(),
                symbol=(payload.get("symbol") or "").strip() or None,
                mode=str(payload.get("mode") or "chat"),
                time_horizon=(payload.get("time_horizon") or "").strip() or None,
                position_state=(payload.get("position_state") or "").strip() or None,
                risk_profile=(payload.get("risk_profile") or "").strip() or None,
                style=ResponseStyle.STRUCTURED,
                memory=to_conversation_messages(payload.get("memory") or []),
            )
            if not request.user_question:
                raise ValueError("user_question is required")
            response = self.orchestrator.answer(request)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})
            return

        self._send_json(200, {"answer": response.answer})


class LocalServer(ThreadingHTTPServer):
    def server_bind(self) -> None:
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind(self.server_address)
        self.server_name = HOST
        self.server_port = self.socket.getsockname()[1]


def main() -> None:
    load_dotenv_file()
    Handler.orchestrator = MasterOrchestrator(DeepSeekProvider())
    server = LocalServer((HOST, PORT), Handler)
    print(f"Serving {APP_TITLE} at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
