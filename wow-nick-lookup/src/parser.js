// Разбор выделенного текста: ищет пары «ник + сервер» персонажей WoW.
//
// Понимает:
//   • Kragar-Silvermoon, Kragar - Tarren Mill, Kragar-TarrenMill, Kragar@Silvermoon, Kragar (Silvermoon)
//   • ссылки raider.io / армори / warcraftlogs / wowprogress / checkpvp
//   • «ник Kragar … сервер silvermoon» (ключевые слова, в т.ч. на разных строках)
//   • «ники Kragar, Thrall и Jaina — все с Silvermoon»
//   • «Kragar silvermoon», «Kragar из Гордунни»
//   • одиночный ник без сервера (поиск по Raider.IO)
(function (root) {
  'use strict';

  const WNL = (root.WNL = root.WNL || {});
  const REALMS = root.WNL_REALMS;

  // ---------- утилиты ----------

  function norm(s) {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  }

  function slugify(s) {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9Ѐ-ӿ]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // «TwistingNether» -> «twisting-nether»
  function camelSlug(s) {
    return slugify(s.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2'));
  }

  function capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase() + s.slice(1).toLocaleLowerCase();
  }

  function isUpper(ch) {
    return ch !== ch.toLocaleLowerCase() && ch === ch.toLocaleUpperCase();
  }

  // ---------- индекс серверов ----------

  const realmIndex = new Map(); // norm(name) -> { name, slug, regions: [] }

  function addRealm(name, region, slug) {
    const key = norm(name);
    let r = realmIndex.get(key);
    if (!r) {
      r = { name, slug: slug || REALMS.SLUG_OVERRIDES[name] || slugify(name), regions: [] };
      realmIndex.set(key, r);
    }
    if (!r.regions.includes(region)) r.regions.push(region);
  }

  if (REALMS) {
    REALMS.EU.forEach((n) => addRealm(n, 'eu'));
    REALMS.US.forEach((n) => addRealm(n, 'us'));
    Object.entries(REALMS.RU).forEach(([n, slug]) => addRealm(n, 'eu', slug));
  }

  function findRealm(name) {
    return realmIndex.get(norm(name)) || null;
  }

  // ---------- словари ----------

  const NAME_KW = new Set([
    'ник', 'ника', 'ником', 'нику', 'нік', 'ники', 'ников', 'никнейм', 'никнейма',
    'nick', 'nickname', 'nik', 'name', 'имя', 'перс', 'перса', 'персонаж', 'персонажа', 'персонажи',
    'чар', 'чара', 'char', 'character', 'toon', 'мейн', 'мейна', 'main', 'альт', 'альта', 'alt',
    'твинк', 'твинка', 'игрок', 'игрока', 'player', 'ign',
  ]);

  const REALM_KW = new Set([
    'сервер', 'сервера', 'сервере', 'сервак', 'сервака', 'серв', 'серве', 'реалм', 'реалме', 'реалма',
    'рилм', 'мир', 'мире', 'server', 'realm', 'srv', 'serv',
  ]);

  // слова, которые можно пропустить между ключевым словом и значением
  const FILLER = new Set([
    'у', 'него', 'неё', 'нее', 'его', 'её', 'ее', 'их', 'мой', 'моего', 'моей', 'мою', 'наш', 'это',
    'этого', 'зовут', 'называется', 'на', 'в', 'с', 'со', 'is', 'my', 'his', 'her', 'the', 'a', 'on',
    'in', 'from', 'called', 'named',
  ]);

  // связки между ником и сервером: «Kragar из Silvermoon»
  const CONNECT = new Set(['из', 'с', 'со', 'на', 'from', 'on', 'of', 'at', '@']);

  const LIST_JOIN = new Set(['и', 'а', 'или', 'and', 'or']);

  // частые слова, которые точно не ники
  const STOP = new Set([
    'и', 'а', 'но', 'или', 'не', 'на', 'в', 'во', 'с', 'со', 'из', 'по', 'за', 'от', 'до', 'для', 'это',
    'он', 'она', 'они', 'мы', 'вы', 'ты', 'я', 'его', 'её', 'ее', 'их', 'него', 'неё', 'нее', 'них', 'у',
    'все', 'всё', 'всех', 'тут', 'там', 'вот', 'как', 'так', 'что', 'кто', 'где', 'уже', 'еще', 'ещё',
    'привет', 'пока', 'спасибо', 'да', 'нет', 'ок', 'окей', 'ладно', 'можно', 'нужно', 'надо', 'есть',
    'был', 'была', 'были', 'играет', 'играю', 'играем', 'живет', 'живёт', 'зовут', 'тоже', 'также',
    'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'my', 'his', 'her', 'their', 'our', 'your',
    'he', 'she', 'they', 'we', 'you', 'it', 'on', 'in', 'at', 'of', 'from', 'to', 'for', 'with', 'all',
    'hi', 'hello', 'hey', 'thanks', 'yes', 'no', 'ok', 'okay', 'plays', 'play', 'also', 'here', 'there',
    'this', 'that', 'these', 'those', 'eu', 'us', 'kr', 'tw', 'na',
  ]);

  const REGION_TOKENS = { EU: 'eu', US: 'us', NA: 'us', KR: 'kr', TW: 'tw', eu: 'eu' };

  // одиночные слова-серверы, которые без заглавной буквы скорее обычные слова
  const AMBIGUOUS_REALMS = new Set(['гром', 'nemesis', 'sentinels', 'outland', 'hellfire', 'maelstrom', 'tirion']);

  const NAME_RE = /^\p{L}{2,12}$/u;
  const REALM_WORD_RE = /^\p{L}[\p{L}'’]{2,}$/u;

  // ---------- токенизация ----------

  function tokenize(text) {
    const tokens = [];
    const re = /[\p{L}\p{N}'’]+/gu;
    let m;
    while ((m = re.exec(text))) {
      let s = m[0];
      let start = m.index;
      while (s && /['’]/.test(s[0])) { s = s.slice(1); start++; }
      while (s && /['’]/.test(s[s.length - 1])) s = s.slice(0, -1);
      if (!s) continue;
      tokens.push({ text: s, lower: s.toLocaleLowerCase(), start, end: start + s.length, used: false });
    }
    return tokens;
  }

  // ---------- основной разбор ----------

  function parse(input) {
    const text = String(input || '').replace(/ /g, ' ');
    const results = [];
    const tokens = tokenize(text);
    const byStart = new Map(tokens.map((t, i) => [t.start, i]));
    const gap = (i) => text.slice(tokens[i - 1].end, tokens[i].start);

    const isKw = (t) => NAME_KW.has(t.lower) || REALM_KW.has(t.lower);
    const nameShaped = (t) => NAME_RE.test(t.text) && !isKw(t) && !STOP.has(t.lower);

    function markRange(start, end) {
      tokens.forEach((t) => { if (t.start >= start && t.end <= end) t.used = true; });
    }

    // регион, явно упомянутый в тексте (EU / US / …)
    let regionHint = null;
    tokens.forEach((t) => { if (REGION_TOKENS[t.text]) regionHint = REGION_TOKENS[t.text]; });

    function push(c) {
      results.push(Object.assign({ region: null, confidence: 'high' }, c));
    }

    function realmFromKnown(r) {
      return { realm: r.name, realmSlugs: [r.slug], realmRegions: r.regions.slice(), realmKnown: true };
    }

    function realmFromRaw(word) {
      const slugs = [camelSlug(word)];
      const flat = slugs[0].replace(/-/g, '');
      if (flat !== slugs[0]) slugs.push(flat);
      return { realm: word, realmSlugs: slugs, realmRegions: null, realmKnown: false };
    }

    // известный сервер, начинающийся с токена i (до 4 слов, самое длинное совпадение)
    function realmAt(i, allowUsed) {
      for (let w = Math.min(4, tokens.length - i); w >= 1; w--) {
        let ok = true;
        let joined = '';
        for (let k = i; k < i + w; k++) {
          if (tokens[k].used && !allowUsed) { ok = false; break; }
          if (k > i && !/^[ \t\-()]+$/.test(gap(k))) { ok = false; break; }
          joined += tokens[k].text;
        }
        if (!ok) continue;
        const r = findRealm(joined);
        if (r) return { realm: r, from: i, to: i + w - 1 };
      }
      return null;
    }

    // 1. ссылки на профили
    const URL_RE = /(?:raider\.io|worldofwarcraft(?:\.blizzard)?\.com|warcraftlogs\.com|wowprogress\.com|checkpvp\.net)\S*?\/characters?\/(eu|us|kr|tw|cn)\/([^\/\s?#]+)\/([^\/\s?#)\]>]+)/gi;
    let m;
    while ((m = URL_RE.exec(text))) {
      let realmRaw, name;
      try { realmRaw = decodeURIComponent(m[2]); name = decodeURIComponent(m[3]); } catch (e) { continue; }
      const known = findRealm(realmRaw.replace(/-/g, ' '));
      push(Object.assign(
        { name: capitalize(name), start: m.index, end: m.index + m[0].length, region: m[1].toLowerCase() },
        known ? realmFromKnown(known) : { realm: realmRaw, realmSlugs: [realmRaw.toLowerCase()], realmRegions: null, realmKnown: false },
      ));
      markRange(m.index, m.index + m[0].length);
    }

    // 2. Ник-Сервер / Ник@Сервер / Ник|Сервер
    const DASH_RE = /(?<![\p{L}\p{N}'’\-])(\p{L}{2,12})[ \t]?[-–—@|\/][ \t]?(?=\p{L})/gu;
    while ((m = DASH_RE.exec(text))) {
      const ni = byStart.get(m.index);
      const ri = byStart.get(m.index + m[0].length);
      if (ni === undefined || ri === undefined) continue;
      const nt = tokens[ni];
      const rt = tokens[ri];
      if (nt.used || rt.used || nt.text !== m[1]) continue;
      if (REGION_TOKENS[nt.text] || isKw(nt) || STOP.has(nt.lower)) continue;
      // «Azjol-Nerub», «Король-лич» — это сам сервер, а не ник-сервер
      const whole = realmAt(ni);
      if (whole && whole.to > ni) continue;
      const span = realmAt(ri);
      if (span) {
        push(Object.assign({ name: capitalize(nt.text), start: nt.start, end: tokens[span.to].end }, realmFromKnown(span.realm)));
        for (let k = ni; k <= span.to; k++) tokens[k].used = true;
        DASH_RE.lastIndex = tokens[span.to].end;
      } else if (isUpper(nt.text[0]) && isUpper(rt.text[0]) && REALM_WORD_RE.test(rt.text) && !REGION_TOKENS[rt.text]) {
        push(Object.assign({ name: capitalize(nt.text), start: nt.start, end: rt.end, confidence: 'medium' }, realmFromRaw(rt.text)));
        nt.used = rt.used = true;
        DASH_RE.lastIndex = rt.end;
      }
    }

    // 3. ключевые слова «ник …» / «сервер …»
    const names = []; // { name, idx, start, end, fromKw, paired }
    const realms = []; // { info, from, to, start, end, fromKw, paired }

    const skippable = (t) => !t.used && (FILLER.has(t.lower) || isKw(t));

    tokens.forEach((t, i) => {
      if (t.used || !NAME_KW.has(t.lower)) return;
      let j = i + 1;
      while (j < tokens.length && skippable(tokens[j]) && j - i <= 4) j++;
      if (j >= tokens.length || tokens[j].used || !nameShaped(tokens[j])) return;
      t.used = true;
      // список имён: «ники Kragar, Thrall и Jaina»
      for (;;) {
        const tj = tokens[j];
        tj.used = true;
        names.push({ name: capitalize(tj.text), idx: j, start: tj.start, end: tj.end, fromKw: true, paired: false });
        let k = j + 1;
        if (k >= tokens.length) break;
        let sep = gap(k);
        if (LIST_JOIN.has(tokens[k].lower) && k + 1 < tokens.length) { sep += ','; k++; }
        if (!/[,;\/&\n]/.test(sep) || /[.!?]/.test(sep)) break;
        const tk = tokens[k];
        if (tk.used || !nameShaped(tk)) break;
        // «ник Kragar, Silvermoon» — сервер; «ники Kragar, Thrall и Jaina с Silvermoon» — ник
        const asRealm = realmAt(k);
        if (asRealm && (asRealm.to > k || !tokens.slice(k + 1).some((x, n) => !x.used && realmAt(k + 1 + n)))) break;
        j = k;
      }
    });

    tokens.forEach((t, i) => {
      if (t.used || !REALM_KW.has(t.lower)) return;
      let j = i + 1;
      while (j < tokens.length && skippable(tokens[j]) && j - i <= 4) j++;
      if (j >= tokens.length || tokens[j].used) return;
      const span = realmAt(j);
      t.used = true;
      if (span) {
        for (let k = span.from; k <= span.to; k++) tokens[k].used = true;
        realms.push({ info: realmFromKnown(span.realm), from: span.from, to: span.to, start: tokens[span.from].start, end: tokens[span.to].end, fromKw: true, kwIdx: i, paired: false });
      } else if (REALM_WORD_RE.test(tokens[j].text) && !STOP.has(tokens[j].lower)) {
        tokens[j].used = true;
        realms.push({ info: realmFromRaw(tokens[j].text), from: j, to: j, start: tokens[j].start, end: tokens[j].end, fromKw: true, kwIdx: i, paired: false });
      }
    });

    // 4. серверы, упомянутые без ключевых слов
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].used) continue;
      const span = realmAt(i);
      if (!span) continue;
      if (span.from === span.to) {
        const t = tokens[i];
        const key = norm(t.text);
        if (!isUpper(t.text[0]) && (key.length <= 5 || AMBIGUOUS_REALMS.has(key))) continue;
        if (AMBIGUOUS_REALMS.has(key)) {
          // «Гром» посреди фразы — скорее обычное слово; принимаем только как «Ник Гром» / «из Гром»
          const prev = tokens[i - 1];
          const ok = prev && !prev.used && (CONNECT.has(prev.lower) || nameShaped(prev)) && /^[ \t,(]+$/.test(gap(i));
          if (!ok) continue;
        }
      }
      for (let k = span.from; k <= span.to; k++) tokens[k].used = true;
      realms.push({ info: realmFromKnown(span.realm), from: span.from, to: span.to, start: tokens[span.from].start, end: tokens[span.to].end, fromKw: false, paired: false });
      i = span.to;
    }
    realms.sort((a, b) => a.start - b.start);

    // 5. соседство: «Kragar Silvermoon», «Kragar из Гордунни», «Kragar (Silvermoon)»
    realms.forEach((r) => {
      if (r.fromKw || r.paired) return;
      let p = r.from - 1;
      if (p < 0) return;
      if (CONNECT.has(tokens[p].lower) && /^[ \t]+$/.test(gap(r.from)) && !tokens[p].used) p--;
      if (p < 0) return;
      const between = text.slice(tokens[p].end, tokens[r.from].start);
      if (!/^[\s,:;()\[\]@|\-–—]*(?:\p{L}+[ \t]+)?$/u.test(between) || /[.!?]/.test(between)) return;

      const kwName = names.find((n) => n.idx === p && !n.paired);
      if (kwName) {
        kwName.paired = r.paired = true;
        push(Object.assign({ name: kwName.name, start: kwName.start, end: r.end }, r.info));
        return;
      }
      // соседнее слово само распознано как сервер («Thrall Draenor») — тогда это ник
      const asRealm = realms.find((x) => x !== r && !x.paired && !x.fromKw && x.from === p && x.to === p);
      const t = tokens[p];
      if ((t.used && !asRealm) || !NAME_RE.test(t.text) || isKw(t) || STOP.has(t.lower) || REGION_TOKENS[t.text]) return;
      if (asRealm) asRealm.paired = true; // больше не сервер
      t.used = true;
      r.paired = true;
      // «omali kazzak» отдельной строкой — это точно ник, даже с маленькой буквы
      const lineStart = text.lastIndexOf('\n', t.start - 1) + 1;
      const nl = text.indexOf('\n', r.end);
      const lineEnd = nl === -1 ? text.length : nl;
      const PUNCT = /^[\s\-–—•*>:,.;!?()\[\]«»"']*$/u;
      const ownLine = PUNCT.test(text.slice(lineStart, t.start)) && PUNCT.test(text.slice(r.end, lineEnd));
      push(Object.assign(
        { name: capitalize(t.text), start: t.start, end: r.end, confidence: isUpper(t.text[0]) || ownLine ? 'high' : 'medium' },
        r.info,
      ));
    });

    // 6. оставшиеся ники из ключевых слов + оставшиеся серверы
    const freeNames = names.filter((n) => !n.paired);
    let freeRealms = realms.filter((r) => !r.paired);

    if (freeNames.length) {
      const pool = freeRealms.length ? freeRealms : realms.filter((r) => r.paired || r.fromKw);
      if (pool.length === 1 || (pool.length && new Set(pool.map((r) => r.info.realmSlugs[0])).size === 1)) {
        freeNames.forEach((n) => { n.paired = true; pool[0].paired = true; push(Object.assign({ name: n.name, start: n.start, end: n.end }, pool[0].info)); });
      } else if (pool.length && pool.length === freeNames.length) {
        freeNames.forEach((n, i) => { n.paired = pool[i].paired = true; push(Object.assign({ name: n.name, start: n.start, end: Math.max(n.end, pool[i].end) }, pool[i].info)); });
      } else if (pool.length) {
        freeNames.forEach((n) => {
          // ближайший сервер, предпочитаем идущий после ника
          let best = null;
          let bestD = Infinity;
          pool.forEach((r) => {
            const d = r.start >= n.end ? r.start - n.end : (n.start - r.end) * 1.5;
            if (d < bestD) { bestD = d; best = r; }
          });
          n.paired = best.paired = true;
          push(Object.assign({ name: n.name, start: n.start, end: n.end }, best.info));
        });
      } else {
        freeNames.forEach((n) => push({ name: n.name, start: n.start, end: n.end, realm: null, realmSlugs: [], realmRegions: null, realmKnown: false }));
      }
    }

    // 7. сервер без ника: ищем ник поблизости («Kragar\nу него сервер silvermoon»)
    freeRealms = realms.filter((r) => !r.paired);
    freeRealms.forEach((r) => {
      const anchor = r.fromKw ? r.kwIdx : r.from;
      for (let p = anchor - 1; p >= 0 && anchor - p <= 8; p--) {
        const t = tokens[p];
        if (t.used) continue;
        if (!nameShaped(t) || FILLER.has(t.lower) || REGION_TOKENS[t.text]) continue;
        if (!isUpper(t.text[0])) continue;
        t.used = true;
        r.paired = true;
        push(Object.assign({ name: capitalize(t.text), start: t.start, end: r.end, confidence: 'medium' }, r.info));
        break;
      }
    });

    // 8. выделено одно слово, похожее на ник — ищем без сервера
    if (!results.length) {
      const words = tokens.filter((t) => !t.used);
      if (words.length === 1 && tokens.length === 1 && nameShaped(words[0]) && !findRealm(words[0].text)) {
        const t = words[0];
        push({ name: capitalize(t.text), start: t.start, end: t.end, realm: null, realmSlugs: [], realmRegions: null, realmKnown: false, confidence: 'medium' });
      }
    }

    // регион и уверенность
    const meaningful = text.replace(/\s+/g, '').length || 1;
    const seen = new Set();
    const out = [];
    results
      .sort((a, b) => a.start - b.start)
      .forEach((c) => {
        if (!c.region && regionHint) c.region = regionHint;
        const covered = text.slice(c.start, c.end).replace(/\s+/g, '').length;
        if (c.confidence === 'medium' && covered / meaningful >= 0.7 && c.realm) c.confidence = 'high';
        c.key = (c.name + '-' + (c.realmSlugs[0] || '') + '-' + (c.region || '')).toLocaleLowerCase();
        if (seen.has(c.key)) return;
        seen.add(c.key);
        out.push(c);
      });
    return out;
  }

  WNL.parse = parse;
  WNL.findRealm = findRealm;
  WNL.slugify = slugify;
  WNL.camelSlug = camelSlug;
  WNL.capitalize = capitalize;

  if (typeof module !== 'undefined' && module.exports) module.exports = WNL;
})(typeof globalThis !== 'undefined' ? globalThis : self);
