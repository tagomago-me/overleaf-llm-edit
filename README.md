# Overleaf LLM Edit

AI paragraph editing for self-hosted [Overleaf](https://github.com/overleaf/overleaf) (Community & Server Pro).

Adds an **AI Edit** button to the Overleaf editor toolbar — select any paragraph and get AI-powered edits using Anthropic Claude, OpenAI GPT, or DeepSeek.

## Architecture

```
Browser (userscript)          Host nginx                     Backend (Node)
┌─────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│ Overleaf Editor  │    │ overleaf.tagomago.me │    │ 127.0.0.1:3099      │
│  + AI Edit btn   │───▶│ /api/llm-edit        │───▶│ server.js            │
│  (userscript)    │    │                      │    │  · anthropic ✓      │
└─────────────────┘    └──────────────────────┘    │  · openai ✓          │
                                                   │  · deepseek ✓        │
                                                   └──────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node.js backend — receives text + instruction, calls AI API |
| `nginx.conf` | Nginx location block to proxy `/api/llm-edit` → backend |
| `overleaf-llm-edit.service` | Systemd service unit for production use |
| `runit-run` | Runit service script for Docker-based setups |
| `overleaf-ai-editor.user.js` | Userscript for Tampermonkey / Violentmonkey |
| `.env.example` | Environment variables template |

## Setup

### 1. Backend server

On the host machine:

```bash
# Install dependencies (once)
npm install express

# Start
source .env
LLM_EDIT_PORT=3099 node /opt/llm-edit/server.js
```

Or install as a systemd service (auto-start on boot, auto-restart on crash):

```bash
sudo cp overleaf-llm-edit.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now overleaf-llm-edit.service
```

### 2. Nginx (host)

Add this location block to your Overleaf **host** nginx site config:

```nginx
location /api/llm-edit {
    proxy_pass http://127.0.0.1:3099/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 60s;
}
```

> ⚠️ **Important:** The proxy must be on the **host** nginx (not inside the Overleaf Docker container), because the backend runs on the host. If the container is restarted, the host nginx config survives.

Reload nginx:

```bash
nginx -s reload
```

### 3. Environment variables

Create a `.env` file (or reuse your existing one):

```bash
# At least one of these:
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...

# Optional: override default provider/model
LLM_EDIT_PROVIDER=anthropic
LLM_EDIT_MODEL=claude-sonnet-4-6
```

### 4. Userscript (browser)

**Recommended:** Install [Violentmonkey](https://violentmonkey.github.io/) — it works out of the box on all browsers including Brave without extra permissions.

> ⚠️ **Brave users:** Tampermonkey requires enabling "Allow User Scripts" in `brave://extensions/` → Tampermonkey Details. If that option is not available, use Violentmonkey instead.

1. Install Violentmonkey (or Tampermonkey) for your browser
2. Open the raw userscript URL in the browser:
   
   **<https://raw.githubusercontent.com/tagomago-me/overleaf-llm-edit/main/overleaf-ai-editor.user.js>**
3. Violentmonkey/Tampermonkey will detect the userscript and prompt to install — accept
4. Edit the `@match` URL in the script header if your Overleaf URL differs from `https://overleaf.tagomago.me/project/*`

### 5. Usage

Open any project in the Overleaf **Code Editor** (not Visual Editor):

| Method | Action |
|--------|--------|
| **Toolbar** | Click the `🤖 AI` button in the Code Editor toolbar |
| **Right-click** | Select text → right-click → floating **🤖 AI Edit** button appears |
| **Keyboard** | Select text and press `Ctrl+Shift+E` |

A modal opens where you can:
- Type an editing instruction (e.g., "rewrite concisely", "translate to Portuguese", "fix grammar")
- Choose the AI model from a dropdown (Anthropic Claude, OpenAI GPT, DeepSeek)
- Choose a quick action (Concise, Fix Grammar, Formal, Simplify)

### 6. Keep backend alive (cron fallback)

If systemd is not available, use a cron job to restart the server automatically:

```cron
*/5 * * * * pgrep -x ".*node.*/opt/llm-edit/server.js" >/dev/null || (source /path/to/.env && LLM_EDIT_PORT=3099 nohup node /opt/llm-edit/server.js >> /var/log/llm-edit-overleaf.log 2>&1 &)
```

> ⚠️ Use `pgrep -x` (exact match) not `pgrep -f` to avoid the cron matching its own command string.

## Configuration

Set environment variables to control behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_EDIT_PORT` | `3099` | Backend listen port |
| `LLM_EDIT_PROVIDER` | `anthropic` | Default AI provider |
| `LLM_EDIT_MODEL` | `claude-sonnet-4-6` | Default model |

Supported providers: `openai`, `anthropic`, `deepseek`.

Models tested:
- `claude-sonnet-4-6` (Anthropic, default)
- `gpt-4o` (OpenAI)
- `deepseek-chat` (DeepSeek)

## Troubleshooting

**Userscript not appearing in Overleaf?**
- Make sure you're using **Code Editor** mode, not Visual Editor
- Check that your browser supports userscripts (Violentmonkey recommended for Brave)
- Verify the `@match` URL in the script matches your Overleaf URL
- For Brave + Tampermonkey: enable "Allow User Scripts" in `brave://extensions/` → Tampermonkey
- Reload the Overleaf page after installing

**502 Bad Gateway when clicking AI Edit?**
- Check that the backend server is running: `curl http://127.0.0.1:3099/`
- Check the nginx config has the `/api/llm-edit` location
- Check nginx logs: `tail -f /var/log/nginx/error.log`

**Backend keeps dying?**
- Install as systemd service (auto-restart)
- Or use the cron fallback

## License

MIT
