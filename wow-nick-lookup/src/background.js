// Service worker: ходит в API Raider.IO (у content-скриптов нет обхода CORS) и кэширует ответы.
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

async function lookup({ name, realmSlugs, regions }) {
  for (const region of regions) {
    for (const realm of realmSlugs) {
      const r = await fetchProfile(region, realm, name);
      if (r.status !== 'notfound') return r;
    }
  }
  return { status: 'notfound' };
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'lookup') { lookup(msg).then(sendResponse); return true; }
  if (msg && msg.type === 'search') { search(msg).then(sendResponse); return true; }
  return false;
});
