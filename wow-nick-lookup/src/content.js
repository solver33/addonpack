// Следит за выделением текста на странице и показывает карточки персонажей рядом с курсором.
(function () {
  'use strict';
  const WNL = globalThis.WNL;
  if (!WNL || WNL.__contentLoaded) return;
  WNL.__contentLoaded = true;

  let settings = Object.assign({}, WNL.DEFAULTS);
  WNL.loadSettings().then((s) => { settings = s; });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      Object.keys(changes).forEach((k) => { settings[k] = changes[k].newValue; });
      if (!settings.enabled) close();
    });
  } catch (e) { /* контекст расширения недоступен */ }

  let host = null;
  let shadow = null;
  let lastText = '';
  let requestId = 0;
  let anchor = { x: 0, y: 0 };

  const inHost = (e) => host && e.composedPath().includes(host);

  document.addEventListener('mousedown', (e) => { if (host && !inHost(e)) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, true);
  document.addEventListener('mouseup', (e) => {
    if (!settings.enabled || e.button !== 0 || inHost(e)) return;
    if (settings.trigger === 'alt' && !e.altKey) return;
    const x = e.clientX;
    const y = e.clientY;
    // даём браузеру дообновить выделение (двойной/тройной клик)
    setTimeout(() => handleSelection(x, y), 10);
  }, true);

  function handleSelection(x, y) {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : '';
    if (!text.trim() || text.length > 4000) return;
    if (host && text === lastText) return;
    const candidates = WNL.parse(text);
    if (!candidates.length) return;
    lastText = text;
    show(candidates, x, y);
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
    if (host) host.remove();
    host = shadow = null;
  }

  function place() {
    if (!host) return;
    const pad = 8;
    const w = host.offsetWidth;
    const hgt = host.offsetHeight;
    let left = anchor.x + 14;
    let top = anchor.y + 18;
    if (left + w > innerWidth - pad) left = Math.max(pad, innerWidth - w - pad);
    if (top + hgt > innerHeight - pad) top = Math.max(pad, anchor.y - hgt - 12);
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  async function show(candidates, x, y) {
    if (host) { host.remove(); host = null; }
    ensureHost();
    anchor = { x, y };
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
      const res = await WNL.resolve(c, settings);
      if (id !== requestId) return;
      if (c.confidence !== 'high' && res.status !== 'found') { rows[i].remove(); return; }
      WNL.ui.fillRow(rows[i], c, res);
      host.style.visibility = 'visible';
      place();
    }));

    if (id === requestId && !list.children.length) close();
  }
})();
