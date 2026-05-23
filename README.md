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
| `runit-run` | Runit service script for auto-start inside Overleaf container |
| `userscript.js` | Tampermonkey/Greasemonkey script that adds the editor button |
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

### 2. Nginx (host)

Add this location block to your Overleaf nginx site config:

```nginx
location /api/llm-edit {
    proxy_pass http://127.0.0.1:3099/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 60s;
}
```

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

### 4. Runit (optional — inside Docker container)

If running Overleaf in Docker, copy `runit-run` to the container:

```bash
docker cp runit-run sharelatex:/etc/service/llm-edit-overleaf/run
docker exec sharelatex chmod +x /etc/service/llm-edit-overleaf/run
docker exec sharelatex sv start llm-edit-overleaf
```

> **Note:** This is optional — the backend can run on the host. Use runit only if you
> want the backend inside the container (requires exposing port 3099).

### 5. Userscript (browser)

1. Install [Tampermonkey](https://www.tampermonkey.net) or [Violentmonkey](https://violentmonkey.github.io/)
2. Open `userscript.js` in your browser
3. Tampermonkey will prompt to install — accept
4. Edit the `@match` URL in the script header if your Overleaf URL differs

### 6. Cron (optional — keeps backend alive)

```cron
*/5 * * * * pgrep -x ".*node.*/opt/llm-edit/server.js" >/dev/null || (source /path/to/.env && LLM_EDIT_PORT=3099 nohup node /opt/llm-edit/server.js >> /var/log/llm-edit-overleaf.log 2>&1 &)
```

## Configuration

Set environment variables to control behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_EDIT_PORT` | `3099` | Backend listen port |
| `LLM_EDIT_PROVIDER` | `anthropic` | Default AI provider |
| `LLM_EDIT_MODEL` | `claude-sonnet-4-6` | Default model |

Supported providers: `openai`, `anthropic`, `deepseek`.

## License

MIT
