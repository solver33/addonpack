// Общая логика для всплывашки на странице и для popup: настройки и запрос данных у background.
(function (root) {
  'use strict';
  const WNL = (root.WNL = root.WNL || {});

  WNL.DEFAULTS = {
    enabled: true,
    trigger: 'auto', // 'auto' — при любом выделении, 'alt' — только с зажатым Alt
    regions: 'eu,us', // порядок регионов для поиска
    defaultRealm: '', // сервер по умолчанию для ников без сервера
    searchNameOnly: true, // искать ники без сервера через поиск Raider.IO
    highlight: 'discord', // подсветка ников в переписке Discord: 'discord' (вкл) | 'off'
    colorize: true, // сразу раскрашивать подсвеченные ники в цвет класса
  };

  WNL.loadSettings = function () {
    return new Promise((resolve) => {
      try { chrome.storage.sync.get(WNL.DEFAULTS, (s) => resolve(Object.assign({}, WNL.DEFAULTS, s))); }
      catch (e) { resolve(Object.assign({}, WNL.DEFAULTS)); }
    });
  };

  function regionsFor(cand, settings) {
    if (cand.region) return [cand.region];
    const order = String(settings.regions || 'eu,us').split(',').filter(Boolean);
    if (!cand.realmRegions) return order;
    // известный сервер: сначала регионы, где он есть, в порядке из настроек
    const list = order.filter((r) => cand.realmRegions.includes(r));
    cand.realmRegions.forEach((r) => { if (!list.includes(r)) list.push(r); });
    return list;
  }

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError || !res) {
            resolve({ status: 'error', message: 'Расширение перезагружено — обнови страницу' });
          } else resolve(res);
        });
      } catch (e) {
        resolve({ status: 'error', message: 'Расширение перезагружено — обнови страницу' });
      }
    });
  }

  // Возвращает { status: 'found', profiles: [...] } | { status: 'notfound' | 'norealm' | 'error', message? }
  WNL.resolve = async function (cand, settings) {
    if (!cand.realmSlugs.length && settings.defaultRealm) {
      const known = WNL.findRealm(settings.defaultRealm);
      Object.assign(cand, known
        ? { realm: known.name, realmSlugs: [known.slug], realmRegions: known.regions.slice() }
        : { realm: settings.defaultRealm, realmSlugs: [WNL.camelSlug(settings.defaultRealm)], realmRegions: null });
    }
    if (cand.realmSlugs.length) {
      const res = await send({ type: 'lookup', name: cand.name, realmSlugs: cand.realmSlugs, regions: regionsFor(cand, settings) });
      return res.status === 'found' ? { status: 'found', profiles: [res.profile] } : res;
    }
    if (!settings.searchNameOnly) return { status: 'norealm' };
    return send({ type: 'search', name: cand.name, regions: regionsFor(cand, settings) });
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
