// Карточка персонажей на странице: показывается при выделении текста или при наведении на подсвеченный ник.
(function () {
  'use strict';
  const WNL = globalThis.WNL;
  if (!WNL || WNL.page) return;

  const listeners = [];
  const page = (WNL.page = {
    settings: Object.assign({}, WNL.DEFAULTS),
    onSettings(fn) { listeners.push(fn); },
    show,
    close,
    get origin() { return host ? origin : null; },
    isInCard: (e) => !!host && e.composedPath().includes(host),
    toast,
  });

  WNL.loadSettings().then((s) => { page.settings = s; listeners.forEach((fn) => fn(s)); });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      Object.keys(changes).forEach((k) => { page.settings[k] = changes[k].newValue; });
      if (!page.settings.enabled) close();
      listeners.forEach((fn) => fn(page.settings));
    });
  } catch (e) { /* контекст расширения недоступен */ }

  let host = null;
  let shadow = null;
  let origin = null; // 'select' | 'hover'
  let lastText = '';
  let requestId = 0;
  let anchor = { right: 0, left: 0, top: 0 };

  document.addEventListener('mousedown', (e) => { if (host && !page.isInCard(e)) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, true);
  document.addEventListener('mouseup', (e) => {
    const s = page.settings;
    if (!s.enabled || e.button !== 0 || page.isInCard(e)) return;
    if (s.trigger === 'alt' && !e.altKey) return;
    const x = e.clientX;
    const y = e.clientY;
    // даём браузеру дообновить выделение (двойной/тройной клик)
    setTimeout(() => handleSelection(x, y), 10);
  }, true);

  function handleSelection(x, y) {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : '';
    if (!text.trim() || text.length > 4000) return;
    if (host && origin === 'select' && text === lastText) return;
    const candidates = WNL.parse(text);
    if (!candidates.length) return;
    show(candidates, { right: x + 16, left: x - 16, top: y - 14 }, 'select');
    lastText = text;
  }

  // короткое уведомление у курсора («Скопировано: /inv …»)
  let toastHost = null;
  let toastTimer = 0;
  function toast(text, x, y) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.setAttribute('data-wnl', '');
      toastHost.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;';
      const sh = toastHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = WNL.ui.CSS;
      sh.append(style, Object.assign(document.createElement('div'), { className: 'wnl-toast' }));
    }
    toastHost.shadowRoot.querySelector('.wnl-toast').textContent = text;
    (document.body || document.documentElement).append(toastHost);
    toastHost.style.left = `${Math.min(x + 12, innerWidth - 260)}px`;
    toastHost.style.top = `${Math.max(4, y - 34)}px`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastHost.remove(), 1300);
  }

  function ensureHost() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-wnl', '');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = WNL.ui.CSS;
    shadow.append(style);
    (document.body || document.documentElement).append(host);
  }

  function close() {
    requestId++;
    lastText = '';
    origin = null;
    if (host) host.remove();
    host = shadow = null;
  }

  function place() {
    if (!host) return;
    const pad = 8;
    const w = host.offsetWidth;
    const hgt = host.offsetHeight;
    // справа от ника/курсора; если не влезает — слева
    let left = anchor.right;
    if (left + w > innerWidth - pad) left = anchor.left - w;
    left = Math.max(pad, Math.min(left, innerWidth - w - pad));
    const top = Math.max(pad, Math.min(anchor.top, innerHeight - hgt - pad));
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  // anchorSpec: { right, left, top } — карточка ставится правее `right` (или левее `left`), верх на `top`
  // onResult(cand, res) — необязательный колбэк с результатом поиска
  async function show(candidates, anchorSpec, from, onResult) {
    close();
    ensureHost();
    origin = from;
    anchor = anchorSpec;
    const id = ++requestId;
    const { panel, list } = WNL.ui.createPanel(close);
    shadow.append(panel);

    const rows = candidates.map((c) => {
      const row = WNL.ui.createRow(c);
      list.append(row);
      return row;
    });
    host.style.visibility = rows.some((r) => !r.hidden) ? 'visible' : 'hidden';
    place();

    await Promise.all(candidates.map(async (c, i) => {
      const res = await WNL.resolve(c, page.settings);
      if (onResult) onResult(c, res);
      if (id !== requestId) return;
      if (c.confidence !== 'high' && res.status !== 'found') { rows[i].remove(); return; }
      WNL.ui.fillRow(rows[i], c, res);
      host.style.visibility = 'visible';
      place();
    }));

    if (id === requestId && !list.children.length) close();
  }
})();
