// Отрисовка карточек персонажей. Используется и во всплывашке на странице (shadow DOM), и в popup.
(function (root) {
  'use strict';
  const WNL = (root.WNL = root.WNL || {});
  const T = () => WNL.i18n;

  const FONT = '"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';

  const CSS = `
    :host { all: initial; }
    .wnl-panel {
      font: 13px/1.3 ${FONT}; color: #dbdee1; background: #232428;
      border: 1px solid rgba(255,255,255,.06); border-radius: 10px; padding: 4px;
      box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.2);
      min-width: 230px; max-width: 380px; animation: wnl-in .12s ease-out;
    }
    @keyframes wnl-in { from { opacity: 0; transform: translateY(2px); } }
    .wnl-list { max-height: 60vh; overflow-y: auto; scrollbar-width: thin; }
    .wnl-row { padding: 6px 8px; border-radius: 7px; }
    .wnl-row + .wnl-row { margin-top: 2px; }
    .wnl-row:hover { background: rgba(255,255,255,.04); }
    .wnl-row[hidden] { display: none; }
    .wnl-char { display: flex; align-items: center; gap: 10px; }
    .wnl-char + .wnl-char { margin-top: 8px; }
    .wnl-ava {
      position: relative; width: 34px; height: 34px; border-radius: 9px; flex: none; overflow: hidden;
      background: #2b2d31; cursor: pointer; box-shadow: 0 0 0 2px var(--cls, #4e5058);
      transition: transform .12s ease;
    }
    .wnl-ava:hover { transform: scale(1.06); }
    .wnl-ava img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .wnl-ava::after {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; letter-spacing: .02em; opacity: 0; transition: opacity .12s;
    }
    .wnl-ava:hover::after { content: "/inv"; opacity: 1; color: #fff; background: rgba(17,18,20,.6); }
    .wnl-ava.wnl-ok::after { content: "✓"; opacity: 1; color: #23a55a; background: rgba(17,18,20,.75); font-size: 16px; }
    .wnl-info { flex: 1; min-width: 0; }
    .wnl-top { display: flex; align-items: center; gap: 8px; }
    .wnl-name {
      flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-weight: 700; font-size: 14px; color: var(--cls, #f2f3f5); text-decoration: none;
    }
    .wnl-name:hover { text-decoration: underline; }
    .wnl-realm { font-weight: 500; color: #949ba4; }
    .wnl-pill {
      flex: none; font-size: 11px; font-weight: 600; line-height: 16px; padding: 0 7px; border-radius: 999px;
      color: var(--fac, #b5bac1); background: color-mix(in srgb, var(--fac, #b5bac1) 16%, transparent);
    }
    .wnl-sub { margin-top: 2px; font-size: 12px; color: #b5bac1; }
    .wnl-sub .wnl-cls { color: var(--cls); font-weight: 600; }
    .wnl-muted { color: #80848e; }
    .wnl-main { font-weight: 600; word-break: break-word; color: #f2f3f5; }
    .wnl-dim { color: #949ba4; font-weight: 400; }
    .wnl-err { color: #f23f43; font-weight: 400; }
    .wnl-link { color: #00a8fc; font-weight: 400; text-decoration: none; }
    .wnl-link:hover { text-decoration: underline; }
    .wnl-note { font-size: 12px; color: #949ba4; margin: 0 0 6px; }
    .wnl-spin {
      display: inline-block; width: 10px; height: 10px; margin-right: 6px; vertical-align: -1px;
      border: 2px solid #4e5058; border-top-color: #dbdee1; border-radius: 50%; animation: wnl-r .7s linear infinite;
    }
    .wnl-toast {
      display: flex; align-items: center; gap: 6px; white-space: nowrap;
      font: 600 13px/1.3 ${FONT}; color: #dbdee1; background: #111214;
      border-radius: 8px; padding: 6px 10px; box-shadow: 0 6px 18px rgba(0,0,0,.45); animation: wnl-in .12s ease-out;
    }
    .wnl-toast::before { content: "✓"; color: #23a55a; font-weight: 700; }
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

  // формат для игры: Ник-Сервер, сервер без пробелов (Kragar-TarrenMill)
  function inGameName(name, realm) {
    return realm ? `${name}-${String(realm).replace(/\s+/g, '')}` : name;
  }

  function createPanel() {
    const list = h('div', { class: 'wnl-list' });
    const panel = h('div', { class: 'wnl-panel' }, list);
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
    const ingame = inGameName(p.name, p.realm);
    const cls = t.CLASS_COLOR[p.class] || '#f2f3f5';
    const fac = t.FACTION_COLOR[p.faction] || '#b5bac1';
    const spec = p.spec ? `${t.t('SPEC', p.spec)}${p.role ? ' (' + t.t('ROLE', p.role) + ')' : ''}` : null;
    const rest = [
      spec,
      t.t('RACE', p.race) || null,
      p.itemLevel ? `${p.itemLevel} ilvl` : null,
      p.guild ? `‹${p.guild}›` : null,
    ].filter(Boolean).join(' · ');
    const tail = [p.region ? String(p.region).toUpperCase() : null, p.source === 'blizzard' ? 'Blizzard' : null]
      .filter(Boolean).join(' · ');

    // клик по аватару копирует команду приглашения: /inv Ник-Сервер (сервер без пробелов, как в игре)
    const invite = `/inv ${ingame}`;
    const ava = h('div', { class: 'wnl-ava', title: `Скопировать «${invite}»` },
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

    return h('div', { class: 'wnl-char', style: `--cls:${cls};--fac:${fac}` },
      ava,
      h('div', { class: 'wnl-info' },
        h('div', { class: 'wnl-top' },
          h('a', { class: 'wnl-name', href: p.url, target: '_blank', rel: 'noopener noreferrer', title: 'Открыть профиль' },
            p.name, h('span', { class: 'wnl-realm' }, `-${p.realm}`)),
          p.faction ? h('span', { class: 'wnl-pill' }, t.t('FACTION', p.faction)) : null),
        h('div', { class: 'wnl-sub' },
          h('span', { class: 'wnl-cls' }, t.t('CLASS', p.class)),
          rest ? ` · ${rest}` : '',
          tail ? h('span', { class: 'wnl-muted' }, ` · ${tail}`) : null)));
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

  WNL.ui = { CSS, createPanel, createRow, fillRow, copyText, inGameName };
})(typeof globalThis !== 'undefined' ? globalThis : self);
