// Finds WoW character names (and their realms) in free text.
// Works in the browser (sets globalThis.Solver33Parser) and in Node (module.exports).
(function (root) {
  'use strict';

  const REALMS = typeof module !== 'undefined' && module.exports
    ? require('./realms.js')
    : root.SOLVER33_REALMS;

  // Character names: 2-12 letters, no digits or spaces.
  const NAME_RE = /^\p{L}{2,12}$/u;
  const WORD_RE = /[\p{L}\p{M}'’]+(?:-[\p{L}\p{M}'’]+)*/gu;
  const MAX_REALM_WORDS = 3;

  // Words that introduce a character name or a realm ("ник Kragar", "сервер Silvermoon").
  const NAME_KEYWORDS = new Set([
    'ник', 'ника', 'никнейм', 'имя', 'перс', 'персонаж', 'персонажа', 'игрок', 'чар',
    'nick', 'nickname', 'name', 'char', 'character', 'player', 'toon',
  ]);
  const REALM_KEYWORDS = new Set([
    'сервер', 'сервере', 'сервера', 'серв', 'реалм', 'реалме', 'realm', 'server',
  ]);
  // Capitalized words that are almost never character names.
  const STOPWORDS = new Set([
    'i', 'a', 'an', 'the', 'and', 'or', 'on', 'in', 'at', 'from', 'is', 'his', 'her', 'my', 'he', 'she',
    'hi', 'hello', 'hey', 'yo', 'ok', 'okay', 'pls', 'please', 'thanks', 'lfg', 'lfm', 'inv', 'invite',
    'и', 'а', 'в', 'на', 'с', 'со', 'у', 'него', 'неё', 'нее', 'его', 'её', 'ее', 'мой', 'моя', 'это',
    'вот', 'привет', 'пригласи', 'инвайт', 'инв', 'спасибо', 'да', 'нет', 'он', 'она', 'там', 'тут',
    ...NAME_KEYWORDS, ...REALM_KEYWORDS,
  ]);

  const realmKey = (s) => s.toLowerCase().replace(/[\s'’\-]/g, '');

  // key -> { name, english, regions[] }
  const realmIndex = new Map();
  for (const [name, english, regions] of REALMS) {
    const realm = { name, english, regions: regions.split(',') };
    realmIndex.set(realmKey(name), realm);
    if (english) realmIndex.set(realmKey(english), realm);
  }

  function lookupRealm(text) {
    return realmIndex.get(realmKey(text)) || null;
  }

  // raider.io identifies realms by their English name, lowercased with spaces as hyphens.
  function realmSlug(realmName) {
    const realm = lookupRealm(realmName);
    const base = realm ? realm.english || realm.name : realmName;
    return base.toLowerCase().replace(/['’]/g, '').trim().replace(/\s+/g, '-');
  }

  function capitalizeName(name) {
    const lower = name.toLocaleLowerCase();
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
  }

  const isUpper = (ch) => ch !== ch.toLocaleLowerCase() && ch === ch.toLocaleUpperCase();
  const isNameShaped = (w) => NAME_RE.test(w);

  function tokenize(text) {
    const tokens = [];
    for (const m of text.matchAll(WORD_RE)) {
      tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
  }

  // Longest run of up to MAX_REALM_WORDS words starting at token i that names a known realm.
  function matchRealmAt(tokens, i, text) {
    for (let n = Math.min(MAX_REALM_WORDS, tokens.length - i); n >= 1; n--) {
      const last = tokens[i + n - 1];
      // Only join words separated by plain spaces (not across line breaks or punctuation).
      const gap = text.slice(tokens[i].start, last.end);
      if (n > 1 && /[^\p{L}\p{M}'’\- ]/u.test(gap)) continue;
      const realm = lookupRealm(gap);
      if (realm) return { realm, length: n };
    }
    return null;
  }

  function makeResult(name, realm, realmText, kind) {
    const realmName = realm ? realm.name : realmText || null;
    return {
      name: capitalizeName(name),
      realm: realmName,
      realmSlug: realmName ? realmSlug(realmName) : null,
      regions: realm ? realm.regions.slice() : null,
      knownRealm: Boolean(realm),
      region: null, // set when the text names one, e.g. "Kragar-Silvermoon-EU"
      kind, // 'joined' (Name-Realm), 'assembled' (name and realm apart) or 'name-only'
    };
  }

  const REGION_RE = /^(eu|us|kr|tw)$/i;

  // Picks up a region code right after a match ("Kragar-Silvermoon (EU)").
  function takeRegion(result, tokens, i, used) {
    const tok = tokens[i];
    if (tok && !used.has(i) && REGION_RE.test(tok.text)) {
      result.region = tok.text.toUpperCase();
      used.add(i);
    }
    return result;
  }

  // Pass 1: "Name-Realm", "Name - Realm", "Name@Realm", including multi-word realms.
  function findJoined(text, tokens, used) {
    const results = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (used.has(i)) continue;

      // Whole token is itself a realm (e.g. "Король-лич", "Azjol-Nerub"): not a Name-Realm pair.
      const parts = tok.text.split('-');
      if (parts.length >= 2 && !lookupRealm(tok.text) && isNameShaped(parts[0])) {
        // "Kragar-Silvermoon" or "Name-Azjol-Nerub" inside one token, possibly continuing
        // with more words ("Kragar-Twisting Nether").
        const realmPart = parts.slice(1).join('-');
        const rest = [{ text: realmPart, start: tok.start + parts[0].length + 1, end: tok.end }]
          .concat(tokens.slice(i + 1));
        const m = matchRealmAt(rest, 0, text);
        if (m) {
          for (let k = 0; k < m.length; k++) used.add(i + k);
          const result = takeRegion(makeResult(parts[0], m.realm, null, 'joined'), tokens, i + m.length, used);
          results.push({ result, at: tok.start });
          continue;
        }
        if (parts.length === 2 && isUpper(parts[0][0]) && isUpper(parts[1][0]) && /^\p{L}{3,}$/u.test(parts[1])) {
          used.add(i);
          results.push({ result: takeRegion(makeResult(parts[0], null, parts[1], 'joined'), tokens, i + 1, used), at: tok.start });
          continue;
        }
      }

      // Separator between two tokens: "Kragar - Silvermoon", "Kragar@Silvermoon".
      const next = tokens[i + 1];
      if (next && isNameShaped(tok.text) && !used.has(i + 1)) {
        const between = text.slice(tok.end, next.start);
        if (/^\s*[-–—@]\s*$/.test(between) || /^\s*\(\s*$/.test(between)) {
          const m = matchRealmAt(tokens, i + 1, text);
          if (m && !lookupRealm(tok.text)) {
            used.add(i);
            for (let k = 1; k <= m.length; k++) used.add(i + k);
            const result = takeRegion(makeResult(tok.text, m.realm, null, 'joined'), tokens, i + m.length + 1, used);
            results.push({ result, at: tok.start });
          }
        }
      }
    }
    return results;
  }

  // Pass 2: name and realm mentioned separately ("ник Kragar, сервер silvermoon").
  function findAssembled(text, tokens, used) {
    const realms = []; // { realm, index }
    const realmTokens = new Set();
    for (let i = 0; i < tokens.length; i++) {
      if (used.has(i) || realmTokens.has(i)) continue;
      const m = matchRealmAt(tokens, i, text);
      if (!m) continue;
      realms.push({ realm: m.realm, index: i });
      for (let k = 0; k < m.length; k++) realmTokens.add(i + k);
      i += m.length - 1;
    }

    const marked = [];
    const loose = [];
    for (let i = 0; i < tokens.length; i++) {
      if (used.has(i) || realmTokens.has(i)) continue;
      const t = tokens[i].text;
      if (!isNameShaped(t) || STOPWORDS.has(t.toLowerCase())) continue;
      const prev = tokens[i - 1];
      if (prev && NAME_KEYWORDS.has(prev.text.toLowerCase())) marked.push(i);
      else if (isUpper(t[0])) loose.push(i);
    }

    const names = marked.length ? marked : loose;
    const results = [];
    if (realms.length && names.length) {
      for (const i of names) {
        // Prefer the nearest realm; ties go to the realm that follows the name.
        let best = null;
        for (const r of realms) {
          const d = r.index > i ? r.index - i : (i - r.index) + 0.5;
          if (!best || d < best.d) best = { r, d };
        }
        results.push({ result: makeResult(tokens[i].text, best.r.realm, null, 'assembled'), at: tokens[i].start });
        used.add(i);
      }
      return results;
    }

    // No realm anywhere: a selection made only of name-like words is a list of bare names.
    if (!realms.length) {
      const free = tokens.filter((_, i) => !used.has(i));
      const onlyNames = free.length > 0 && free.length <= 5 &&
        free.every((t) => isNameShaped(t.text) && !STOPWORDS.has(t.text.toLowerCase())) &&
        /^[\s,;/|]*$/.test(free.reduce((rest, t) => rest.replace(t.text, ''), text.replace(/\p{L}+-\p{L}+/gu, '')));
      if (marked.length) {
        return marked.map((i) => ({ result: makeResult(tokens[i].text, null, null, 'name-only'), at: tokens[i].start }));
      }
      if (onlyNames) {
        return free.map((t) => ({ result: makeResult(t.text, null, null, 'name-only'), at: t.start }));
      }
    }
    return results;
  }

  /**
   * Parse text for characters.
   * @returns {Array<{name, realm, realmSlug, regions, knownRealm, kind}>} in text order, deduplicated.
   */
  function parseCharacters(text) {
    if (!text || typeof text !== 'string') return [];
    // Split a trailing region off "Name-Realm-EU" so it becomes its own word.
    text = text.replace(/(\p{L})-(eu|us|kr|tw)(?!\p{L})/giu, '$1 $2');
    const tokens = tokenize(text);
    const used = new Set();
    const found = findJoined(text, tokens, used).concat(findAssembled(text, tokens, used));
    found.sort((a, b) => a.at - b.at);

    const seen = new Set();
    const out = [];
    for (const { result } of found) {
      const key = `${result.name.toLowerCase()}|${result.realm ? realmKey(result.realm) : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(result);
    }
    return out;
  }

  const api = { parseCharacters, lookupRealm, realmSlug };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Solver33Parser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
