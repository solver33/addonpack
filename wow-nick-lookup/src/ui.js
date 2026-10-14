// Отрисовка карточек персонажей. Используется и во всплывашке на странице (shadow DOM), и в popup.
(function (root) {
  'use strict';
  const WNL = (root.WNL = root.WNL || {});
  const T = () => WNL.i18n;

  const CSS = `
    :host { all: initial; }
    .wnl-panel {
      font: 12.5px/1.3 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #e8e6e3; background: #16181d; border: 1px solid #6b5420; border-radius: 8px;
      box-shadow: 0 8px 28px rgba(0,0,0,.55); min-width: 200px; max-width: 380px; overflow: hidden;
    }
    .wnl-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 2px 4px 2px 8px; background: #1f2229; border-bottom: 1px solid #2c3038;
      font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #c9a54a;
    }
    .wnl-x { all: unset; cursor: pointer; color: #8a8f98; font-size: 16px; line-height: 1; padding: 0 4px; }
    .wnl-x:hover { color: #fff; }
    .wnl-list { max-height: 60vh; overflow-y: auto; }
    .wnl-row { padding: 5px 8px; border-bottom: 1px solid #23262d; }
    .wnl-row:last-child { border-bottom: 0; }
    .wnl-row[hidden] { display: none; }
    .wnl-char { display: flex; align-items: center; gap: 8px; }
    .wnl-char + .wnl-char { margin-top: 4px; }
    .wnl-ava {
      position: relative; width: 28px; height: 28px; border-radius: 4px; flex: none; overflow: hidden;
      background: #2a2d34; cursor: pointer; outline: 1px solid transparent;
    }
    .wnl-ava:hover { outline-color: #c9a54a; }
    .wnl-ava img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .wnl-ava.wnl-ok::after {
      content: "✓"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(20,22,26,.75); color: #7ddc7d; font-size: 16px; font-weight: 700;
    }
    .wnl-info { flex: 1; min-width: 0; }
    .wnl-main { font-weight: 600; word-break: break-word; }
    .wnl-main a { color: inherit; text-decoration: none; }
    .wnl-main a:hover { text-decoration: underline; }
    .wnl-sub { font-size: 11px; color: #9aa0a8; }
    .wnl-dim { color: #8a8f98; font-weight: 400; }
    .wnl-err { color: #ff8a7a; font-weight: 400; }
    .wnl-main a.wnl-link { color: #c9a54a; font-weight: 400; }
    .wnl-note { font-size: 11.5px; color: #9aa0a8; margin-bottom: 4px; }
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
      p.guild ? `<${p.guild}>` : null,
      p.region ? String(p.region).toUpperCase() : null,
      p.source === 'blizzard' ? 'Blizzard' : null,
    ].filter(Boolean).join(' · ');

    // клик по аватару копирует команду приглашения: /inv Ник-Сервер (сервер без пробелов, как в игре)
    const invite = `/inv ${ingame}`;
    const ava = h('div', { class: 'wnl-ava', title: `Клик — скопировать «${invite}»` },
      p.thumbnail ? h('img', { src: p.thumbnail, alt: '' }) : null);
    ava.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    ava.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(invite).then(() => {
        ava.classList.add('wnl-ok');
        setTimeout(() => ava.classList.remove('wnl-ok'), 1000);
      });
    });

    return h('div', { class: 'wnl-char' },
      ava,
      h('div', { class: 'wnl-info' },
        h('div', { class: 'wnl-main' },
          h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, `${p.name}-${p.realm}`),
          ', ',
          h('span', { style: `color:${t.CLASS_COLOR[p.class] || 'inherit'}` }, t.t('CLASS', p.class)),
          ', ',
          h('span', { style: `color:${t.FACTION_COLOR[p.faction] || 'inherit'}` }, t.t('FACTION', p.faction))),
        sub ? h('div', { class: 'wnl-sub' }, sub) : null));
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
    const main = h('div', { class: 'wnl-main' }, label(cand));
    if (res.status === 'notfound') {
      main.append(h('span', { class: 'wnl-dim' }, res.checkedBlizzard ? ' — не найден ни на Raider.IO, ни у Blizzard' : ' — не найден на Raider.IO'));
      if (res.armory) {
        main.append(h('span', { class: 'wnl-dim' }, ' · '),
          h('a', { class: 'wnl-link', href: res.armory, target: '_blank', rel: 'noopener noreferrer' }, 'армори ↗'));
      }
    } else if (res.status === 'norealm') {
      main.append(h('span', { class: 'wnl-dim' }, ' — не указан сервер'));
    } else {
      main.append(h('span', { class: 'wnl-err' }, ` — ${res.message || 'ошибка'}`));
    }
    row.append(main);
  }

  WNL.ui = { CSS, createPanel, createRow, fillRow, copyText };
})(typeof globalThis !== 'undefined' ? globalThis : self);
