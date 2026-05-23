// ==UserScript==
// @name         Overleaf AI Editor
// @namespace    tagomago.overleaf.ai-edit
// @version      1.2
// @description  Edit selected LaTeX with AI (Anthropic/OpenAI/DeepSeek)
// @author       Neo (OpenClaw)
// @match        https://overleaf.tagomago.me/project/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  const API_URL = '/api/llm-edit';
  const MODELS_URL = '/api/llm-edit/models';
  const STORAGE_KEY = 'oleai_last_instr';
  const MODEL_KEY = 'oleai_last_model';

  // ─── Styles ────────────────────────────────────────────────────
  GM_addStyle(`
    .ol-cm-ai-edit-btn {
      display: flex !important; align-items: center !important; gap: 4px !important;
      padding: 2px 8px !important; background: transparent !important;
      border: 1px solid transparent !important; border-radius: 4px !important;
      cursor: pointer !important; font-size: 13px !important;
      color: var(--toolbar-btn-color, #666) !important; white-space: nowrap !important;
    }
    .ol-cm-ai-edit-btn:hover {
      background: var(--toolbar-btn-hover-bg, rgba(0,0,0,0.05)) !important;
      border-color: var(--toolbar-btn-border, #ccc) !important;
    }
    .ol-cm-ai-float-btn {
      position: fixed !important; z-index: 999999 !important;
      padding: 6px 12px !important; background: #4a6cf7 !important; color: #fff !important;
      border: none !important; border-radius: 6px !important; font-size: 13px !important;
      cursor: pointer !important; box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
    }
    .ol-cm-ai-modal-overlay {
      position: fixed !important; inset: 0; background: rgba(0,0,0,0.4) !important;
      z-index: 1000000 !important; display: flex !important;
      align-items: center !important; justify-content: center !important;
    }
    .ol-cm-ai-modal {
      background: #fff !important; border-radius: 8px !important; padding: 20px !important;
      width: 440px !important; max-width: 90vw !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    .ol-cm-ai-modal h3 { margin: 0 0 12px !important; font-size: 16px !important; color: #333 !important; }
    .ol-cm-ai-modal textarea {
      width: 100% !important; min-height: 80px !important; padding: 10px !important;
      border: 1px solid #ddd !important; border-radius: 4px !important; font-size: 14px !important;
      resize: vertical !important; box-sizing: border-box !important;
    }
    .ol-cm-ai-modal textarea:focus { outline: none !important; border-color: #4a6cf7 !important; }
    .ol-cm-ai-model-select {
      width: 100% !important; padding: 8px !important; border: 1px solid #ddd !important;
      border-radius: 4px !important; font-size: 13px !important; margin-bottom: 10px !important;
      background: #fafafa !important; cursor: pointer !important;
    }
    .ol-cm-ai-model-select:focus { outline: none !important; border-color: #4a6cf7 !important; }
    .ol-cm-ai-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .ol-cm-ai-modal-btn {
      padding: 8px 16px !important; border-radius: 4px !important; font-size: 14px !important;
      cursor: pointer !important; border: 1px solid #ddd !important; background: #fff !important; color: #333 !important;
    }
    .ol-cm-ai-modal-btn.primary { background: #4a6cf7 !important; color: #fff !important; border-color: #4a6cf7 !important; }
    .ol-cm-ai-modal-btn.primary:hover { background: #3b5de7 !important; }
    .ol-cm-ai-modal-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }
    .ol-cm-ai-modal-error { color: #e74c3c !important; font-size: 13px !important; margin-top: 8px !important; }
    .ol-cm-ai-quick-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .ol-cm-ai-quick-action {
      padding: 4px 10px !important; font-size: 12px !important;
      border: 1px solid #e0e0e0 !important; border-radius: 12px !important;
      background: #f8f9fa !important; color: #555 !important; cursor: pointer !important;
    }
    .ol-cm-ai-quick-action:hover { background: #e8f0fe !important; border-color: #4a6cf7 !important; color: #4a6cf7 !important; }
  `);

  // ─── Helpers ───────────────────────────────────────────────────

  function getSelectedText() {
    const s = window.getSelection();
    return s && s.rangeCount ? s.toString().trim() : '';
  }

  function focusEditor() {
    document.querySelector('.cm-content')?.focus();
  }

  function replaceSelection(text) {
    focusEditor();
    try {
      document.execCommand('insertText', false, text);
      return true;
    } catch (_) {
      const s = document.createElement('script');
      s.textContent = `document.querySelector('.cm-content')?.focus(); document.execCommand('insertText',false,${JSON.stringify(text)})`;
      document.head.appendChild(s);
      setTimeout(() => s.remove(), 100);
      return true;
    }
  }

  async function callAPI(text, instruction, provider, model) {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, instruction, provider, model }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async function fetchModels() {
    try {
      const resp = await fetch(MODELS_URL);
      return await resp.json();
    } catch { return null; }
  }

  // ─── Modal ─────────────────────────────────────────────────────

  function showEditModal(text) {
    return new Promise((resolve, reject) => {
      document.querySelector('.ol-cm-ai-modal-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.className = 'ol-cm-ai-modal-overlay';
      overlay.innerHTML = `
        <div class="ol-cm-ai-modal">
          <h3>🤖 Edit with AI</h3>
          <div class="ol-cm-ai-quick-actions">
            <button class="ol-cm-ai-quick-action" data-p="Make this more concise. Preserve all LaTeX commands.">Concise</button>
            <button class="ol-cm-ai-quick-action" data-p="Fix grammar and spelling. Preserve all LaTeX.">Fix grammar</button>
            <button class="ol-cm-ai-quick-action" data-p="Rewrite in formal academic tone. Preserve LaTeX.">Formal</button>
            <button class="ol-cm-ai-quick-action" data-p="Expand with more detail and arguments. Preserve LaTeX.">Expand</button>
            <button class="ol-cm-ai-quick-action" data-p="Simplify language, keep meaning. Preserve LaTeX.">Simplify</button>
          </div>
          <select class="ol-cm-ai-model-select" id="ai-model">
            <option value="">Loading models…</option>
          </select>
          <textarea id="ai-instr" placeholder='Describe how to edit the selected paragraph…'></textarea>
          <div class="ol-cm-ai-modal-error" style="display:none"></div>
          <div class="ol-cm-ai-modal-actions">
            <button class="ol-cm-ai-modal-btn" id="ai-cancel">Cancel</button>
            <button class="ol-cm-ai-modal-btn primary" id="ai-apply" disabled>Edit</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const textarea = overlay.querySelector('#ai-instr');
      const select = overlay.querySelector('#ai-model');
      const apply = overlay.querySelector('#ai-apply');
      const cancel = overlay.querySelector('#ai-cancel');
      const errorEl = overlay.querySelector('.ol-cm-ai-modal-error');

      // Load models
      fetchModels().then(data => {
        if (!data || !data.providers) {
          select.innerHTML = '<option value="anthropic:claude-sonnet-4-6">Anthropic Sonnet (default)</option>';
          return;
        }
        let opts = '';
        const saved = localStorage.getItem(MODEL_KEY);
        for (const [prov, info] of Object.entries(data.providers)) {
          for (const [model, desc] of Object.entries(info.models)) {
            const val = `${prov}:${model}`;
            const sel = val === saved || (!saved && val === 'anthropic:claude-sonnet-4-6') ? ' selected' : '';
            opts += `<option value="${val}"${sel}>${info.name} — ${model} (${desc})</option>`;
          }
        }
        select.innerHTML = opts;
      }).catch(() => {
        select.innerHTML = '<option value="anthropic:claude-sonnet-4-6">Anthropic Sonnet (default)</option>';
      });

      // Quick actions
      overlay.querySelectorAll('.ol-cm-ai-quick-action').forEach(b => {
        b.addEventListener('click', () => {
          textarea.value = b.dataset.p;
          apply.disabled = false;
          apply.focus();
        });
      });

      textarea.addEventListener('input', () => {
        apply.disabled = !textarea.value.trim();
        errorEl.style.display = 'none';
      });
      textarea.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!apply.disabled) apply.click(); }
        if (e.key === 'Escape') { overlay.remove(); reject(new Error('Cancelled')); }
      });

      apply.addEventListener('click', async () => {
        const instruction = textarea.value.trim();
        if (!instruction) return;

        const [provider, model] = (select.value || 'anthropic:claude-sonnet-4-6').split(':');
        localStorage.setItem(STORAGE_KEY, instruction);
        localStorage.setItem(MODEL_KEY, select.value);

        apply.disabled = true;
        apply.textContent = '⏳ Editing...';
        errorEl.style.display = 'none';

        let statusEl = overlay.querySelector('.ol-cm-ai-status');
        if (!statusEl) {
          statusEl = document.createElement('div');
          statusEl.className = 'ol-cm-ai-status';
          statusEl.style.cssText = 'font-size:12px;color:#888;margin-top:6px;';
          errorEl.after(statusEl);
        }
        statusEl.textContent = `Using ${provider}/${model}…`;

        try {
          const result = await callAPI(text, instruction, provider, model);
          const ok = replaceSelection(result);
          overlay.remove();
          resolve(result);
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
          apply.disabled = false;
          apply.textContent = 'Edit';
          const st = overlay.querySelector('.ol-cm-ai-status');
          if (st) st.remove();
        }
      });

      cancel.addEventListener('click', () => { overlay.remove(); reject(new Error('Cancelled')); });

      textarea.focus();
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { textarea.value = saved; apply.disabled = false; }
    });
  }

  // ─── UI injection ──────────────────────────────────────────────

  function addToolbarBtn() {
    const tb = document.querySelector('.ol-cm-toolbar');
    if (!tb || document.querySelector('.ol-cm-ai-edit-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'ol-cm-ai-edit-btn';
    btn.title = 'Edit with AI (Ctrl+Shift+E)';
    btn.innerHTML = '🤖 AI';
    btn.onclick = async () => {
      const t = getSelectedText();
      if (!t) { alert('Select text in the editor first.'); return; }
      await showEditModal(t);
    };
    tb.appendChild(btn);
  }

  function rmFloat() { document.querySelector('.ol-cm-ai-float-btn')?.remove(); }

  document.addEventListener('contextmenu', e => {
    const cm = document.querySelector('.cm-content');
    if (cm && cm.contains(e.target) && getSelectedText().length >= 10) {
      rmFloat();
      const t = getSelectedText();
      const btn = document.createElement('button');
      btn.className = 'ol-cm-ai-float-btn';
      btn.textContent = '🤖 AI Edit';
      btn.style.cssText += `left:${e.clientX+10}px;top:${e.clientY+10}px`;
      btn.onclick = async () => { rmFloat(); await showEditModal(t); };
      document.body.appendChild(btn);
      const h = () => { rmFloat(); document.removeEventListener('scroll',h); document.removeEventListener('mousedown',h,true); };
      document.addEventListener('scroll',h,{once:true}); document.addEventListener('mousedown',h,true);
      setTimeout(h, 8000);
    }
  }, true);

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey||e.metaKey) && e.shiftKey && (e.key==='e'||e.key==='E')) {
      e.preventDefault(); e.stopPropagation();
      const t = getSelectedText();
      if (t) showEditModal(t);
    }
  });

  // ─── Init ──────────────────────────────────────────────────────

  function init() {
    const obs = new MutationObserver(() => addToolbarBtn());
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(addToolbarBtn, 1000);
    setTimeout(addToolbarBtn, 3000);
    console.log('[AI Edit] Loaded. Select text → Ctrl+Shift+E or 🤖 AI toolbar button.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
