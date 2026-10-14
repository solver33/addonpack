// Service worker: ходит в API Raider.IO (у content-скриптов нет обхода CORS) и кэширует ответы.
// Если Raider.IO персонажа не нашёл — запасной поиск через официальный Blizzard API (нужны ключи).
'use strict';

const PROFILE_API = 'https://raider.io/api/v1/characters/profile';
const SEARCH_API = 'https://raider.io/api/search';
const FIELDS = 'gear,guild';
const TTL = 10 * 60 * 1000;
const MAX_SEARCH_RESULTS = 5;

const cache = new Map(); // url -> { at, value }

function slim(p) {
  return {
    name: p.name,
    realm: p.realm,
    region: p.region,
    race: p.race,
    class: p.class,
    spec: p.active_spec_name,
    role: p.active_spec_role,
    faction: p.faction,
    itemLevel: p.gear ? Math.round(p.gear.item_level_equipped) : null,
    guild: p.guild ? p.guild.name : null,
    url: p.profile_url,
    thumbnail: p.thumbnail_url,
  };
}

async function cachedFetch(url, parse) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value;
  try {
    const res = await fetch(url);
    if (res.ok) value = await parse(res);
    else if (res.status === 400 || res.status === 404) value = { status: 'notfound' };
    else if (res.status === 429) return { status: 'error', message: 'Raider.IO: слишком много запросов, подожди минуту' };
    else return { status: 'error', message: `Raider.IO ответил ${res.status}` };
  } catch (e) {
    return { status: 'error', message: 'Нет связи с Raider.IO' };
  }
  cache.set(url, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

function fetchProfile(region, realm, name) {
  const url = `${PROFILE_API}?region=${encodeURIComponent(region)}&realm=${encodeURIComponent(realm)}` +
    `&name=${encodeURIComponent(name)}&fields=${encodeURIComponent(FIELDS)}`;
  return cachedFetch(url, async (res) => ({ status: 'found', profile: slim(await res.json()) }));
}

// ---------- Blizzard API (запасной вариант) ----------

const BNET_TOKEN_URL = 'https://oauth.battle.net/token';
const BNET_ROLE = {
  Protection: 'TANK', Blood: 'TANK', Brewmaster: 'TANK', Guardian: 'TANK', Vengeance: 'TANK',
  Restoration: 'HEALING', Holy: 'HEALING', Discipline: 'HEALING', Mistweaver: 'HEALING', Preservation: 'HEALING',
};
const ARMORY_LOCALE = { eu: 'ru-ru', us: 'en-us', kr: 'ko-kr', tw: 'zh-tw' };

let bnetToken = null; // { value, exp, id }

function armoryUrl(region, realmSlug, name) {
  return `https://worldofwarcraft.blizzard.com/${ARMORY_LOCALE[region] || 'en-gb'}/character/` +
    `${region}/${encodeURIComponent(realmSlug)}/${encodeURIComponent(name.toLocaleLowerCase())}`;
}

// строка или объект { en_US: ..., ru_RU: ... }, если API вернул все локали
function loc(v) {
  if (v == null || typeof v === 'string') return v || null;
  return v.en_US || v.en_GB || Object.values(v)[0] || null;
}

async function getBnetCreds() {
  const s = await chrome.storage.local.get({ bnetId: '', bnetSecret: '' });
  return s.bnetId && s.bnetSecret ? s : null;
}

async function getBnetToken(creds, force) {
  if (!bnetToken) bnetToken = (await chrome.storage.session.get('bnetToken')).bnetToken || null;
  if (!force && bnetToken && bnetToken.id === creds.bnetId && bnetToken.exp > Date.now() + 60 * 1000) {
    return bnetToken.value;
  }
  let res;
  try {
    res = await fetch(BNET_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${creds.bnetId}:${creds.bnetSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
  } catch (e) {
    throw new Error('Нет связи с Blizzard API');
  }
  if (res.status === 400 || res.status === 401) throw new Error('Blizzard API: неверный Client ID или Secret');
  if (!res.ok) throw new Error(`Blizzard API: вход не удался (${res.status})`);
  const j = await res.json();
  bnetToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000, id: creds.bnetId };
  chrome.storage.session.set({ bnetToken });
  return bnetToken.value;
}

async function bnetGet(url, creds) {
  let token = await getBnetToken(creds);
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    token = await getBnetToken(creds, true);
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return res;
}

async function fetchBnetProfile(region, realm, name, creds) {
  const base = `https://${region}.api.blizzard.com/profile/wow/character/` +
    `${encodeURIComponent(realm)}/${encodeURIComponent(name.toLocaleLowerCase())}`;
  const qs = `?namespace=profile-${region}&locale=en_US`;
  const hit = cache.get(base);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  let value;
  try {
    const res = await bnetGet(base + qs, creds);
    if (res.status === 404) value = { status: 'notfound' };
    else if (res.status === 429) return { status: 'error', message: 'Blizzard API: слишком много запросов' };
    else if (!res.ok) return { status: 'error', message: `Blizzard API ответил ${res.status}` };
    else {
      const p = await res.json();
      let thumbnail = null;
      try {
        const media = await bnetGet(base + '/character-media' + qs, creds);
        if (media.ok) {
          const assets = (await media.json()).assets || [];
          const avatar = assets.find((a) => a.key === 'avatar');
          thumbnail = avatar ? avatar.value : null;
        }
      } catch (e) { /* без аватара */ }
      const spec = loc(p.active_spec && p.active_spec.name);
      value = {
        status: 'found',
        profile: {
          name: p.name || name,
          realm: loc(p.realm && p.realm.name) || realm,
          region,
          race: loc(p.race && p.race.name),
          class: loc(p.character_class && p.character_class.name),
          spec,
          role: spec ? BNET_ROLE[spec] || 'DPS' : null,
          faction: p.faction && p.faction.type ? String(p.faction.type).toLowerCase() : null,
          itemLevel: p.equipped_item_level || null,
          guild: loc(p.guild && p.guild.name),
          url: armoryUrl(region, realm, p.name || name),
          thumbnail,
          source: 'blizzard',
        },
      };
    }
  } catch (e) {
    return { status: 'error', message: e.message || 'Ошибка Blizzard API' };
  }
  cache.set(base, { at: Date.now(), value });
  return value;
}

// ---------- поиск персонажа ----------

async function lookup({ name, realmSlugs, regions }) {
  let raiderError = null;
  outer: for (const region of regions) {
    for (const realm of realmSlugs) {
      const r = await fetchProfile(region, realm, name);
      if (r.status === 'found') return r;
      if (r.status === 'error') { raiderError = r; break outer; }
    }
  }

  const creds = await getBnetCreds();
  if (creds) {
    for (const region of regions) {
      if (!ARMORY_LOCALE[region]) continue;
      for (const realm of realmSlugs) {
        const b = await fetchBnetProfile(region, realm, name, creds);
        if (b.status === 'found') return b;
        if (b.status === 'error') return b;
      }
    }
  }

  return raiderError || {
    status: 'notfound',
    checkedBlizzard: !!creds,
    armory: armoryUrl(regions[0] || 'eu', realmSlugs[0], name),
  };
}

// Ник без сервера: поиск Raider.IO, затем полные профили точных совпадений.
async function search({ name, regions }) {
  const url = `${SEARCH_API}?term=${encodeURIComponent(name)}`;
  const found = await cachedFetch(url, async (res) => ({ status: 'ok', data: await res.json() }));
  if (found.status === 'error') return found;
  if (found.status !== 'ok') return { status: 'notfound' };

  const lower = name.toLocaleLowerCase();
  const matches = ((found.data && found.data.matches) || [])
    .filter((m) => m.type === 'character' && m.data)
    .map((m) => ({
      name: m.data.name || m.name,
      region: m.data.region && m.data.region.slug,
      realm: m.data.realm && m.data.realm.slug,
    }))
    .filter((m) => m.name && m.region && m.realm && m.name.toLocaleLowerCase() === lower)
    .filter((m) => !regions.length || regions.includes(m.region))
    .sort((a, b) => regions.indexOf(a.region) - regions.indexOf(b.region));

  const total = matches.length;
  const profiles = (await Promise.all(
    matches.slice(0, MAX_SEARCH_RESULTS).map((m) => fetchProfile(m.region, m.realm, m.name)),
  )).filter((r) => r.status === 'found').map((r) => r.profile);

  if (!profiles.length) return { status: 'notfound' };
  return { status: 'found', profiles, more: Math.max(0, total - profiles.length), searched: true };
}

async function bnetTest() {
  const creds = await getBnetCreds();
  if (!creds) return { ok: false, message: 'Заполни Client ID и Client Secret' };
  try {
    await getBnetToken(creds, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'lookup') { lookup(msg).then(sendResponse); return true; }
  if (msg && msg.type === 'bnetTest') { bnetTest().then(sendResponse); return true; }
  if (msg && msg.type === 'search') { search(msg).then(sendResponse); return true; }
  return false;
});
