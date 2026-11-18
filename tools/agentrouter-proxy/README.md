# AgentRouter Local Proxy Bridge

This proxy bridges your **AgentRouter** account (`agentrouter.org`) to any AI developer tool, IDE extension, or terminal agent (Cursor, VS Code, Roo Code, Continue, Cline, Aider, OpenCode, Codex).

It runs locally on **`http://localhost:8318`**, automatically injects the required client signatures (`Originator: codex_cli_rs`), and converts OpenAI Chat Completion calls into the AgentRouter Responses format.

---

## ⚡ Quick Status
- **Proxy Status:** Running at `http://localhost:8318`
- **Base URL:** `http://localhost:8318/v1`
- **Active Model:** `gpt-5.6-sol` / `gpt-6.1-sol`

---

## 🛠️ How to Connect Your Tools

### 1. Cursor / Windsurf / Any OpenAI-Compatible IDE
1. Open **Settings** &rarr; **Models** &rarr; **OpenAI API Key**.
2. Set **Base URL / Override URL**:
   ```
   http://localhost:8318/v1
   ```
3. Set **API Key**:
   ```
   sk-xjeOaRHLKsKzlg5m51s8a3rC2sz7AlLJZsDhBYc4fKa5Q0jA
   ```
4. Add Model Name:
   - `gpt-5.6-sol` or `gpt-6.1-sol` (or standard `gpt-4o`)

---

### 2. VS Code Extensions (Roo Code / Cline / Continue)
1. Select **Provider**: `OpenAI Compatible`
2. **Base URL**: `http://localhost:8318/v1`
3. **API Key**: `sk-xjeOaRHLKsKzlg5m51s8a3rC2sz7AlLJZsDhBYc4fKa5Q0jA`
4. **Model ID**: `gpt-5.6-sol`

---

### 3. Terminal / CLI Agents (Aider / Shell Scripts / Python)
In your terminal or shell profile (`~/.zshrc`):
```bash
export OPENAI_BASE_URL="http://localhost:8318/v1"
export OPENAI_API_KEY="sk-xjeOaRHLKsKzlg5m51s8a3rC2sz7AlLJZsDhBYc4fKa5Q0jA"
```

---

## 🚀 Managing the Proxy
- **To Start Manually:**
  ```bash
  ./tools/agentrouter-proxy/start.sh
  ```
- **Health Check:**
  Open `http://localhost:8318/health` in your browser.
