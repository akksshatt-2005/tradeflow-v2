#!/usr/bin/env python3
"""
AgentRouter Local Proxy Bridge (Full Multi-Turn & Tool-Calling Support)
Translates OpenAI /v1/chat/completions (including functions, tools, streaming)
to AgentRouter's /v1/responses format while spoofing Codex CLI signatures.
"""

import sys
import json
import time
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

AGENTROUTER_API_KEY = "sk-xjeOaRHLKsKzlg5m51s8a3rC2sz7AlLJZsDhBYc4fKa5Q0jA"
TARGET_HOST = "https://agentrouter.org"
DEFAULT_MODEL = "gpt-5.6-sol"
PORT = 8318

CODEX_HEADERS = {
    "Originator": "codex_cli_rs",
    "User-Agent": "codex_cli_rs/0.101.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464",
    "Version": "0.101.0",
}

def convert_tools(openai_tools):
    converted = []
    for t in openai_tools:
        fn = t.get("function") if "function" in t else t
        converted.append({
            "type": "function",
            "name": fn.get("name", ""),
            "description": fn.get("description", ""),
            "parameters": fn.get("parameters", {})
        })
    return converted

def convert_messages(openai_messages):
    input_items = []
    for msg in openai_messages:
        role = msg.get("role", "user")
        content = msg.get("content") or ""
        tool_calls = msg.get("tool_calls")
        tool_call_id = msg.get("tool_call_id")

        if role == "tool" and tool_call_id:
            out_str = json.dumps(content) if isinstance(content, (dict, list)) else str(content)
            input_items.append({
                "type": "function_call_output",
                "call_id": tool_call_id,
                "output": out_str
            })
        elif role == "assistant" and tool_calls:
            if content:
                input_items.append({"role": "assistant", "content": content})
            for tc in tool_calls:
                fn = tc.get("function", {})
                input_items.append({
                    "type": "function_call",
                    "call_id": tc.get("id", f"call_{int(time.time()*1000)}"),
                    "name": fn.get("name", ""),
                    "arguments": fn.get("arguments", "{}")
                })
        else:
            if isinstance(content, list):
                parts = [p.get("text", "") for p in content if isinstance(p, dict) and "text" in p]
                content = "\n".join(parts)
            input_items.append({"role": role, "content": str(content)})
    return input_items

class AgentRouterProxyHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/health"):
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "service": "AgentRouter Proxy Bridge",
                "target": TARGET_HOST,
                "supported_models": ["gpt-5.6-sol", "gpt-6.1-sol", "gpt-4o", "claude-3-5-sonnet"]
            }).encode("utf-8"))
            return

        if self.path.startswith("/v1/models"):
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            models_data = {
                "object": "list",
                "data": [
                    {"id": "gpt-5.6-sol", "object": "model", "owned_by": "agentrouter"},
                    {"id": "gpt-6.1-sol", "object": "model", "owned_by": "agentrouter"},
                    {"id": "gpt-4o", "object": "model", "owned_by": "agentrouter"},
                    {"id": "gpt-4o-mini", "object": "model", "owned_by": "agentrouter"},
                    {"id": "claude-3-5-sonnet", "object": "model", "owned_by": "agentrouter"},
                ]
            }
            self.wfile.write(json.dumps(models_data).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        
        auth_header = self.headers.get("Authorization", "")
        api_key = AGENTROUTER_API_KEY
        if auth_header.startswith("Bearer ") and auth_header[7:].strip().startswith("sk-"):
            api_key = auth_header[7:].strip()

        try:
            body_json = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception:
            body_json = {}

        if self.path.startswith("/v1/chat/completions"):
            self._handle_chat_completions(body_json, api_key)
        elif self.path.startswith("/v1/responses"):
            self._forward_responses(body_bytes, api_key)
        else:
            self._forward_generic(self.path, body_bytes, api_key)

    def _handle_chat_completions(self, body, api_key):
        messages = body.get("messages", [])
        requested_model = body.get("model", DEFAULT_MODEL)
        stream = body.get("stream", False)
        raw_tools = body.get("tools", [])

        # Map model
        model = "gpt-6.1-sol" if "6" in requested_model else DEFAULT_MODEL

        # Convert messages and tools
        input_items = convert_messages(messages)
        converted_tools = convert_tools(raw_tools) if raw_tools else []

        payload = {
            "model": model,
            "input": input_items
        }
        if converted_tools:
            payload["tools"] = converted_tools
        if "temperature" in body:
            payload["temperature"] = body["temperature"]

        req_headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            **CODEX_HEADERS
        }

        req = urllib.request.Request(
            f"{TARGET_HOST}/v1/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers=req_headers
        )

        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                
                # Parse output
                out_text = ""
                tool_calls = []
                outputs = resp_data.get("output", [])
                
                for item in outputs:
                    itype = item.get("type")
                    if itype == "message":
                        for c in item.get("content", []):
                            if c.get("type") == "output_text":
                                out_text += c.get("text", "")
                    elif itype == "function_call":
                        tool_calls.append({
                            "id": item.get("call_id") or item.get("id"),
                            "type": "function",
                            "function": {
                                "name": item.get("name", ""),
                                "arguments": item.get("arguments", "{}")
                            }
                        })

                finish_reason = "tool_calls" if tool_calls else "stop"
                usage_info = resp_data.get("usage", {})
                chat_id = "chatcmpl-" + resp_data.get("id", str(int(time.time())))

                if stream:
                    self.send_response(200)
                    self._send_cors()
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "close")
                    self.end_headers()

                    delta = {"role": "assistant"}
                    if out_text:
                        delta["content"] = out_text
                    if tool_calls:
                        delta["tool_calls"] = tool_calls

                    chunk = {
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "delta": delta,
                            "finish_reason": finish_reason
                        }]
                    }
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))
                    self.wfile.write(b"data: [DONE]\n\n")
                    self.wfile.flush()
                    self.close_connection = True
                else:
                    self.send_response(200)
                    self._send_cors()
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()

                    msg_obj = {
                        "role": "assistant",
                        "content": out_text if out_text else None
                    }
                    if tool_calls:
                        msg_obj["tool_calls"] = tool_calls

                    openai_resp = {
                        "id": chat_id,
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "message": msg_obj,
                            "finish_reason": finish_reason
                        }],
                        "usage": {
                            "prompt_tokens": usage_info.get("input_tokens", 0),
                            "completion_tokens": usage_info.get("output_tokens", 0),
                            "total_tokens": usage_info.get("total_tokens", 0)
                        }
                    }
                    self.wfile.write(json.dumps(openai_resp).encode("utf-8"))

        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            print(f"[HTTP ERROR {e.code}] {err_body}")
            self.send_response(e.code)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body.encode("utf-8"))
        except Exception as e:
            print(f"[PROXY EXCEPTION] {type(e).__name__}: {e}")
            self.send_response(500)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def _forward_responses(self, body_bytes, api_key):
        req_headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            **CODEX_HEADERS
        }
        req = urllib.request.Request(
            f"{TARGET_HOST}/v1/responses",
            data=body_bytes,
            headers=req_headers
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self.send_response(resp.status)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(e.read())

    def _forward_generic(self, path, body_bytes, api_key):
        req_headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            **CODEX_HEADERS
        }
        req = urllib.request.Request(
            f"{TARGET_HOST}{path}",
            data=body_bytes if body_bytes else None,
            headers=req_headers
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self.send_response(resp.status)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(e.read())

def run_server():
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, AgentRouterProxyHandler)
    print(f"🚀 AgentRouter Proxy Bridge (with Native Tools) active on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down proxy bridge...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
