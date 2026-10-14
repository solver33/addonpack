// Сам находит ники в переписке Discord, подчёркивает их и показывает карточку при наведении.
// Работает только по изменениям страницы (новые сообщения), пачками раз в SCAN_DELAY мс;
// в фоновой вкладке полностью засыпает.
//
// DOM страницы не меняется: подсветка сделана через CSS Custom Highlight API (как подсветка поиска
// в браузере). Поэтому React-приложения вроде Discord не ломаются.
(function () {
  'use strict';
  const WNL = globalThis.WNL;
  const page = WNL && WNL.page;
  if (!page || WNL.__highlight || typeof Highlight === 'undefined' || !CSS.highlights) return;
  WNL.__highlight = true;

  const BLOCK = 'body,div,p,li,td,th,dd,dt,blockquote,article,section,h1,h2,h3,h4,h5,h6,pre,header,footer,main,aside,form,ul,ol,table,tr';
  const SKIP = 'script,style,noscript,textarea,input,select,svg,[contenteditable=""],[contenteditable="true"],' +
    '[role="textbox"],[class*="placeholder"],[class*="textArea"],[data-wnl]';
  // ищем только в сообщениях чата: поле ввода, подсказки, названия каналов и т.п. не трогаем
  const MESSAGES = '[id^="chat-messages-"],[id^="message-content-"],[id^="message-reply-context-"]';
  const MAX_TEXT = 20000;
  const SCAN_DELAY = 400; // мс: изменения на странице собираются и обрабатываются пачкой
  const MOVE_INTERVAL = 100; // мс: как часто проверять, что под курсором
  const MAX_RESULTS = 1000;
  const HOVER_DELAY = 250;
  const HIDE_DELAY = 350;
  const PREFETCH_CONCURRENCY = 2;

  const base = new Highlight();
  const miss = new Highlight();
  const hoverHl = new Highlight();
  hoverHl.priority = 1;
  const classHl = new Map(); // 'warrior' -> Highlight
  const entries = new Map(); // контейнер -> { text, items: [{ range, cand }] }
  const results = new Map(); // cand.key -> результат поиска
  let active = false;
  let observer = null;

  // ---------- включение/выключение ----------

  function wanted(s) {
    return s.enabled && s.highlight !== 'off' && location.hostname === 'discord.com';
  }

  function start() {
    if (active) return;
    active = true;
    CSS.highlights.set('wnl-nick', base);
    CSS.highlights.set('wnl-miss', miss);
    CSS.highlights.set('wnl-hover', hoverHl);
    classHl.forEach((h, cls) => CSS.highlights.set(`wnl-c-${cls}`, h));
    observer = new MutationObserver(onMutations);
    if (!document.hidden) resume();
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    addEventListener('click', onClick, true);
  }

  function stop() {
    if (!active) return;
    active = false;
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('scroll', onScroll, { capture: true });
    document.removeEventListener('mousemove', onMouseMove);
    removeEventListener('click', onClick, true);
    ['wnl-nick', 'wnl-miss', 'wnl-hover', ...[...classHl.keys()].map((c) => `wnl-c-${c}`)].forEach((n) => CSS.highlights.delete(n));
    [base, miss, hoverHl, ...classHl.values()].forEach((h) => h.clear());
    entries.clear();
    pending.clear();
  }

  page.onSettings((s) => (wanted(s) ? start() : stop()));

  // вкладка в фоне — ничего не делаем; вернулись — один раз досканировали изменения
  function resume() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    queueTextIn(document.body);
  }

  function onVisibility() {
    if (!active) return;
    if (document.hidden) {
      observer.disconnect();
      clearTimeout(flushTimer);
      flushTimer = 0;
      pending.clear();
    } else {
      resume();
    }
  }

  // ---------- поиск ников в тексте страницы ----------

  const pending = new Set();
  let flushTimer = 0;

  function containerOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest(MESSAGES) || el.closest(SKIP)) return null;
    return el.closest(BLOCK);
  }

  function queue(container) {
    if (!container) return;
    pending.add(container);
    if (!flushTimer) flushTimer = setTimeout(flush, SCAN_DELAY);
  }

  function queueTextIn(root) {
    if (root.nodeType === 3) { queue(containerOf(root)); return; }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (/\p{L}/u.test(n.nodeValue)) queue(containerOf(n));
    }
  }

  function onMutations(list) {
    for (const m of list) {
      // поле ввода сообщения и сама карточка расширения — пропускаем сразу
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!t || t.closest(SKIP)) continue;
      if (m.type === 'characterData') queue(containerOf(m.target));
      else {
        m.addedNodes.forEach(queueTextIn);
        if (m.removedNodes.length) queue(containerOf(m.target));
      }
    }
  }

  function flush() {
    flushTimer = 0;
    const batch = [...pending].slice(0, 80);
    batch.forEach((c) => { pending.delete(c); process(c); });
    // удалённые со страницы сообщения
    entries.forEach((e, c) => { if (!c.isConnected) drop(c); });
    if (pending.size) flushTimer = setTimeout(flush, 30);
    else schedulePrefetch();
  }

  // текст контейнера без вложенных блоков; <br> и вложенные блоки — перевод строки
  function collect(container) {
    let text = '';
    const parts = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1 && (n.matches(SKIP) || (n !== container && n.matches(BLOCK)))) {
          text += '\n';
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode()) && text.length <= MAX_TEXT) {
      if (n.nodeType === 3) { parts.push({ node: n, start: text.length, end: text.length + n.nodeValue.length }); text += n.nodeValue; }
      else if (n.tagName === 'BR') text += '\n';
    }
    return { text, parts };
  }

  function drop(container) {
    const e = entries.get(container);
    if (!e) return;
    e.items.forEach((it) => unmark(it.range));
    entries.delete(container);
  }

  function unmark(range) {
    base.delete(range);
    miss.delete(range);
    classHl.forEach((h) => h.delete(range));
  }

  function point(parts, offset, isEnd) {
    for (const p of parts) {
      if (isEnd ? offset > p.start && offset <= p.end : offset >= p.start && offset < p.end) {
        return { node: p.node, offset: offset - p.start };
      }
    }
    return null;
  }

  function process(container) {
    if (!container.isConnected || container.closest(SKIP)) { drop(container); return; }
    const { text, parts } = collect(container);
    const prev = entries.get(container);
    if (prev && prev.text === text) return;
    drop(container);
    if (text.length > MAX_TEXT || !/\p{L}/u.test(text)) return;

    const items = [];
    WNL.parse(text)
      // неуверенные («вчера omali kazzak звал») подсвечиваем, только если Raider.IO их нашёл
      .filter((c) => c.realm && (c.confidence === 'high' || page.settings.colorize))
      .forEach((c) => {
        let s = c.start;
        let e = c.end;
        // «ник Kragar … сервер Silvermoon» — подчёркиваем только ник
        const startsWithName = text.slice(s, s + c.name.length).toLocaleLowerCase() === c.name.toLocaleLowerCase();
        if (startsWithName && e - s > c.name.length + String(c.realm).length + 4) e = s + c.name.length;
        const a = point(parts, s, false);
        const b = point(parts, e, true);
        if (!a || !b) return;
        const range = new Range();
        try { range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset); } catch (err) { return; }
        items.push({ range, cand: c });
        mark(range, c);
      });
    entries.set(container, { text, items });
  }

  // ---------- раскраска по классу ----------

  function classKey(cls) {
    return String(cls || '').toLowerCase().replace(/[^a-z]+/g, '-');
  }

  const isFound = (cand) => { const r = results.get(cand.key); return !!r && r.status === 'found'; };

  function mark(range, cand) {
    unmark(range);
    const res = results.get(cand.key);
    if (cand.confidence !== 'high' && !(res && res.status === 'found')) return;
    if (res && res.status === 'found' && res.profiles.length === 1) {
      const cls = classKey(res.profiles[0].class);
      if (!classHl.has(cls)) {
        classHl.set(cls, new Highlight());
        if (active) CSS.highlights.set(`wnl-c-${cls}`, classHl.get(cls));
      }
      classHl.get(cls).add(range);
    } else if (res && res.status === 'notfound') {
      miss.add(range);
    } else {
      base.add(range);
    }
  }

  function remember(cand, res) {
    if (res.status === 'error') return;
    if (results.size >= MAX_RESULTS) results.delete(results.keys().next().value);
    results.set(cand.key, res);
    entries.forEach((e) => e.items.forEach((it) => { if (it.cand.key === cand.key) mark(it.range, it.cand); }));
  }

  // заранее узнаём класс ников, видимых на экране
  const inflight = new Set();
  let prefetchTimer = 0;

  function onScroll() { schedulePrefetch(); if (page.origin === 'hover') page.close(); }

  function schedulePrefetch() {
    if (!page.settings.colorize) return;
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(prefetch, 300);
  }

  function visible(range) {
    const r = range.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  function prefetch() {
    if (!active || !page.settings.colorize) return;
    const todo = [];
    entries.forEach((e) => e.items.forEach((it) => {
      const k = it.cand.key;
      if (!results.has(k) && !inflight.has(k) && !todo.some((x) => x.key === k) && visible(it.range)) todo.push(it.cand);
    }));
    const next = () => {
      if (!todo.length || inflight.size >= PREFETCH_CONCURRENCY) return;
      const cand = todo.shift();
      inflight.add(cand.key);
      WNL.resolve(Object.assign({}, cand), page.settings).then((res) => {
        inflight.delete(cand.key);
        remember(cand, res);
        next();
      });
      next();
    };
    next();
  }

  // ---------- наведение ----------

  let hovered = null;
  let hoverTimer = 0;
  let hideTimer = 0;
  let moveQueued = false;
  let lastMove = null;

  function caretAt(x, y) {
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      return p && { node: p.offsetNode, offset: p.offset };
    }
    const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    return r && { node: r.startContainer, offset: r.startOffset };
  }

  function itemAt(x, y) {
    const pos = caretAt(x, y);
    if (!pos || pos.node.nodeType !== 3) return null;
    const c = containerOf(pos.node);
    const e = c && entries.get(c);
    if (!e) return null;
    for (const it of e.items) {
      if (it.cand.confidence !== 'high' && !isFound(it.cand)) continue;
      if (!it.range.isPointInRange(pos.node, pos.offset)) continue;
      const hit = [...it.range.getClientRects()].some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1);
      if (hit) return it;
    }
    return null;
  }

  function onMouseMove(e) {
    lastMove = e;
    if (moveQueued || !entries.size) return;
    moveQueued = true;
    setTimeout(() => { moveQueued = false; handleMove(lastMove); }, MOVE_INTERVAL);
  }

  function handleMove(e) {
    if (page.isInCard(e)) { clearTimeout(hideTimer); hideTimer = 0; return; }
    const it = e.buttons ? null : itemAt(e.clientX, e.clientY);
    if (it) {
      clearTimeout(hideTimer);
      hideTimer = 0;
      if (it === hovered) return;
      hovered = it;
      hoverHl.clear();
      hoverHl.add(it.range);
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => open(it), HOVER_DELAY);
      return;
    }
    hovered = null;
    hoverHl.clear();
    clearTimeout(hoverTimer);
    if (page.origin === 'hover' && !hideTimer) {
      hideTimer = setTimeout(() => { hideTimer = 0; if (page.origin === 'hover') page.close(); }, HIDE_DELAY);
    }
  }

  function open(it) {
    if (!it.range.startContainer.isConnected) return;
    if (page.origin === 'select') return; // не перебиваем карточку выделения
    const r = it.range.getBoundingClientRect();
    page.show([Object.assign({}, it.cand)], { right: r.right + 10, left: r.left - 10, top: r.top - 8 }, 'hover', remember);
  }

  // ---------- клик по подсвеченному нику: копируем /inv Ник-Сервер ----------

  function inviteFor(cand) {
    const res = results.get(cand.key);
    const p = res && res.status === 'found' && res.profiles.length === 1 ? res.profiles[0] : null;
    return '/inv ' + (p ? WNL.ui.inGameName(p.name, p.realm) : WNL.ui.inGameName(cand.name, cand.realm));
  }

  function onClick(e) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || page.isInCard(e)) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // это было выделение мышью
    const it = itemAt(e.clientX, e.clientY);
    if (!it) return;
    // не даём сайту обработать клик (ссылка, профиль в Discord и т.п.)
    e.preventDefault();
    e.stopImmediatePropagation();
    const text = inviteFor(it.cand);
    WNL.ui.copyText(text).then(() => page.toast(`Скопировано: ${text}`, e.clientX, e.clientY));
  }
})();
