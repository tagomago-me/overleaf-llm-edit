#!/usr/bin/env node
/**
 * llm-edit-server — Multi-provider AI paragraph editor for Overleaf.
 *
 * POST / with JSON: { text, instruction, provider?, model? }
 * Response: { result: "edited text" }
 *
 * Supported providers:
 *   openai   — gpt-4o-mini, gpt-4o, etc.
 *   anthropic — claude-sonnet-4-6, claude-opus-4-7, claude-3-haiku, etc.
 *   deepseek  — deepseek-chat, deepseek-reasoner, etc.
 */

const http = require('http');
const https = require('https');

const PORT = process.env.LLM_EDIT_PORT || 3099;

// Keys from environment (sourced from /home/mauro/.openclaw/.env via runit)
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPENCLAW_OPENAI_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// ─── Provider configs ───────────────────────────────────────────

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: {
      'gpt-4o-mini': 'Fast & cheap',
      'gpt-4o': 'Best quality',
      'o3-mini': 'Reasoning (slow)',
      'gpt-4.1-nano': 'Cheapest',
    },
    call: (text, instruction, model) => callOpenAI(text, instruction, model),
  },
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-6',
    models: {
      'claude-sonnet-4-6': 'Best balance (Sonnet)',
      'claude-opus-4-7': 'Best quality (Opus)',
      'claude-3-5-haiku': 'Fast & cheap',
    },
    call: (text, instruction, model) => callAnthropic(text, instruction, model),
  },
  deepseek: {
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: {
      'deepseek-chat': 'Fast general (V3)',
      'deepseek-reasoner': 'Reasoning (R1, slow)',
    },
    call: (text, instruction, model) => callDeepSeek(text, instruction, model),
  },
};

const SYSTEM_PROMPT = `You are an expert LaTeX editor. Edit ONLY the provided paragraph according to the instruction.
Return ONLY the edited LaTeX — no explanations, no markdown, no code blocks.
Preserve all LaTeX commands, environments, and math notation unless instructed otherwise.
Maintain the same tense, style, and flow.`;

// ─── OpenAI ──────────────────────────────────────────────────────

function callOpenAI(text, instruction, model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Instruction: ${instruction}\n\nParagraph:\n${text}` },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json.choices?.[0]?.message?.content?.trim() || '');
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Anthropic ───────────────────────────────────────────────────

function callAnthropic(text, instruction, model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Instruction: ${instruction}\n\nParagraph:\n${text}` },
      ],
      temperature: 0.3,
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json.content?.[0]?.text?.trim() || '');
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── DeepSeek ────────────────────────────────────────────────────

function callDeepSeek(text, instruction, model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Instruction: ${instruction}\n\nParagraph:\n${text}` },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json.choices?.[0]?.message?.content?.trim() || '');
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── HTTP Server ─────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method !== 'POST' || req.url !== '/') {
    // GET /models — list available models
    if (req.method === 'GET' && req.url === '/models') {
      const info = {};
      const keyMap = { openai: OPENAI_KEY, anthropic: ANTHROPIC_KEY, deepseek: DEEPSEEK_KEY };
      for (const [k, p] of Object.entries(PROVIDERS)) {
        if (keyMap[k]) {
          info[k] = { name: p.name, defaultModel: p.defaultModel, models: p.models };
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ providers: info, keyStatus: { openai: !!OPENAI_KEY, anthropic: !!ANTHROPIC_KEY, deepseek: !!DEEPSEEK_KEY } }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Use POST / with JSON body { text, instruction, provider?, model? }' }));
    return;
  }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { text, instruction, provider = 'anthropic', model } = JSON.parse(body);

      if (!text || !instruction) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: text, instruction' }));
        return;
      }

      if (text.length > 50000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Text too long (max 50000 chars)' }));
        return;
      }

      const prov = PROVIDERS[provider];
      if (!prov) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown provider '${provider}'. Available: ${Object.keys(PROVIDERS).join(', ')}` }));
        return;
      }

      // Check key
      const keyMap = { openai: OPENAI_KEY, anthropic: ANTHROPIC_KEY, deepseek: DEEPSEEK_KEY };
      if (!keyMap[provider]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `No API key configured for ${prov.name}` }));
        return;
      }

      const result = await prov.call(text, instruction, model);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result, provider, model: model || prov.defaultModel }));
    } catch (e) {
      console.error('❌', e.message);
      let message = e.message;
      if (e.message.includes('401') || e.message.includes('Incorrect API key') || e.message.includes('invalid x-api-key')) {
        message = 'Invalid API key';
      } else if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('credit balance')) {
        message = 'Rate limited or quota exceeded — try a different model';
      } else if (e.message.includes('timeout')) {
        message = 'Request timed out — try with shorter text';
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ llm-edit-server running on http://127.0.0.1:${PORT}`);
  console.log(`   Providers: ${Object.keys(PROVIDERS).join(', ')}`);
  console.log(`   Default: anthropic (claude-sonnet-4-6)`);
  console.log(`   Keys: openai=${!!OPENAI_KEY} anthropic=${!!ANTHROPIC_KEY} deepseek=${!!DEEPSEEK_KEY}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));