// Отрисовка карточек персонажей. Используется и во всплывашке на странице (shadow DOM), и в popup.
(function (root) {
  'use strict';
  const WNL = (root.WNL = root.WNL || {});
  const T = () => WNL.i18n;

  const CSS = `
    :host { all: initial; }
    .wnl-panel {
      font: 13px/1.35 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #e8e6e3; background: #16181d; border: 1px solid #6b5420; border-radius: 8px;
      box-shadow: 0 8px 28px rgba(0,0,0,.55); min-width: 240px; max-width: 420px; overflow: hidden;
    }
    .wnl-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 4px 6px 4px 10px; background: #1f2229; border-bottom: 1px solid #2c3038;
      font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #c9a54a;
    }
    .wnl-x { all: unset; cursor: pointer; color: #8a8f98; font-size: 16px; line-height: 1; padding: 0 4px; }
    .wnl-x:hover { color: #fff; }
    .wnl-list { max-height: 60vh; overflow-y: auto; }
    .wnl-row { padding: 7px 10px; border-bottom: 1px solid #23262d; }
    .wnl-row:last-child { border-bottom: 0; }
    .wnl-row[hidden] { display: none; }
    .wnl-char { display: flex; align-items: center; gap: 8px; }
    .wnl-char + .wnl-char { margin-top: 6px; }
    .wnl-ava { width: 34px; height: 34px; border-radius: 4px; flex: none; background: #2a2d34; object-fit: cover; }
    .wnl-info { flex: 1; min-width: 0; }
    .wnl-main { font-weight: 600; word-break: break-word; }
    .wnl-main a { color: inherit; text-decoration: none; }
    .wnl-main a:hover { text-decoration: underline; }
    .wnl-sub { margin-top: 1px; font-size: 11.5px; color: #9aa0a8; }
    .wnl-dim { color: #8a8f98; font-weight: 400; }
    .wnl-err { color: #ff8a7a; font-weight: 400; }
    .wnl-note { font-size: 11.5px; color: #9aa0a8; margin-bottom: 4px; }
    .wnl-copy {
      all: unset; cursor: pointer; flex: none; padding: 3px 6px; border-radius: 4px;
      color: #c9a54a; border: 1px solid #3a3320; font-size: 12px;
    }
    .wnl-copy:hover { background: #2a2618; }
    .wnl-spin {
      display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: -1px;
      border: 2px solid #555; border-top-color: #c9a54a; border-radius: 50%; animation: wnl-r .8s linear infinite;
    }
    @keyframes wnl-r { to { transform: rotate(360deg); } }
  `;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    });
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function label(cand) {
    return cand.realm ? `${cand.name}-${cand.realm}` : cand.name;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function createPanel(onClose) {
    const list = h('div', { class: 'wnl-list' });
    const panel = h('div', { class: 'wnl-panel' },
      h('div', { class: 'wnl-head' },
        h('span', null, 'Raider.IO'),
        onClose ? h('button', { class: 'wnl-x', title: 'Закрыть (Esc)', onclick: onClose }, '×') : null),
      list);
    return { panel, list };
  }

  function createRow(cand) {
    const row = h('div', { class: 'wnl-row' },
      h('div', { class: 'wnl-main' }, h('span', { class: 'wnl-spin' }), label(cand), h('span', { class: 'wnl-dim' }, ' — ищу…')));
    if (cand.confidence !== 'high') row.hidden = true;
    return row;
  }

  function charView(p) {
    const t = T();
    const ingame = `${p.name}-${String(p.realm || '').replace(/\s+/g, '')}`;
    const spec = p.spec ? `${t.t('SPEC', p.spec)}${p.role ? ' (' + t.t('ROLE', p.role) + ')' : ''}` : null;
    const sub = [
      spec,
      t.t('RACE', p.race) || null,
      p.itemLevel ? `${p.itemLevel} ilvl` : null,
      p.score ? `M+ ${p.score}` : null,
      p.guild ? `<${p.guild}>` : null,
      p.region ? String(p.region).toUpperCase() : null,
    ].filter(Boolean).join(' · ');

    const copyBtn = h('button', { class: 'wnl-copy', title: `Скопировать «${ingame}»` }, '⧉');
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(ingame).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200);
      });
    });

    return h('div', { class: 'wnl-char' },
      p.thumbnail ? h('img', { class: 'wnl-ava', src: p.thumbnail, alt: '' }) : h('div', { class: 'wnl-ava' }),
      h('div', { class: 'wnl-info' },
        h('div', { class: 'wnl-main' },
          h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, `${p.name}-${p.realm}`),
          ', ',
          h('span', { style: `color:${t.CLASS_COLOR[p.class] || 'inherit'}` }, t.t('CLASS', p.class)),
          ', ',
          h('span', { style: `color:${t.FACTION_COLOR[p.faction] || 'inherit'}` }, t.t('FACTION', p.faction))),
        sub ? h('div', { class: 'wnl-sub' }, sub) : null),
      copyBtn);
  }

  function fillRow(row, cand, res) {
    row.textContent = '';
    if (res.status === 'found') {
      if (res.searched) row.append(h('div', { class: 'wnl-note' }, `«${cand.name}» без сервера — совпадения:`));
      res.profiles.forEach((p) => row.append(charView(p)));
      if (res.more) row.append(h('div', { class: 'wnl-note', style: 'margin:4px 0 0' }, `…и ещё ${res.more}. Уточни сервер.`));
      row.hidden = false;
      return;
    }
    const msg = {
      notfound: ' — не найден на Raider.IO',
      norealm: ' — не указан сервер',
    }[res.status];
    row.append(h('div', { class: 'wnl-main' }, label(cand),
      msg ? h('span', { class: 'wnl-dim' }, msg) : h('span', { class: 'wnl-err' }, ` — ${res.message || 'ошибка'}`)));
  }

  WNL.ui = { CSS, createPanel, createRow, fillRow, copyText };
})(typeof globalThis !== 'undefined' ? globalThis : self);
