'use strict';
(async function () {
  const WNL = globalThis.WNL;
  const $ = (id) => document.getElementById(id);
  let settings = await WNL.loadSettings();

  // настройки
  const fields = ['enabled', 'trigger', 'regions', 'defaultRealm', 'searchNameOnly'];
  fields.forEach((k) => {
    const el = $(k);
    if (el.type === 'checkbox') el.checked = !!settings[k];
    else el.value = settings[k];
    el.addEventListener('change', () => {
      settings[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
      chrome.storage.sync.set({ [k]: settings[k] });
      if (k !== 'enabled') run();
    });
  });

  // ключи Blizzard API — только локально, без синхронизации
  const bnet = await chrome.storage.local.get({ bnetId: '', bnetSecret: '' });
  const bnetStatus = $('bnetStatus');
  const setBadge = () => { $('bnetBadge').textContent = bnet.bnetId && bnet.bnetSecret ? '· включён' : ''; };
  setBadge();
  ['bnetId', 'bnetSecret'].forEach((k) => {
    const el = $(k);
    el.value = bnet[k];
    el.addEventListener('change', async () => {
      bnet[k] = el.value.trim();
      await chrome.storage.local.set({ [k]: bnet[k] });
      bnetStatus.textContent = '';
      setBadge();
    });
  });
  $('bnetTest').addEventListener('click', async () => {
    for (const k of ['bnetId', 'bnetSecret']) bnet[k] = $(k).value.trim();
    await chrome.storage.local.set(bnet);
    setBadge();
    bnetStatus.className = 'hint';
    bnetStatus.textContent = 'проверяю…';
    chrome.runtime.sendMessage({ type: 'bnetTest' }, (res) => {
      const ok = res && res.ok;
      bnetStatus.className = ok ? 'ok' : 'bad';
      bnetStatus.textContent = ok ? '✓ ключи работают' : (res && res.message) || 'ошибка';
    });
  });

  // ручной поиск по вставленному тексту
  const text = $('text');
  const results = $('results');
  let timer = 0;
  let runId = 0;

  const style = document.createElement('style');
  style.textContent = WNL.ui.CSS.replace(':host { all: initial; }', '');
  document.head.append(style);

  async function run() {
    const id = ++runId;
    results.textContent = '';
    const value = text.value;
    if (!value.trim()) return;
    const candidates = WNL.parse(value);
    if (!candidates.length) {
      results.innerHTML = '<div class="empty">Не нашёл ничего похожего на ник. Формат: Ник-Сервер.</div>';
      return;
    }
    const { panel, list } = WNL.ui.createPanel(null);
    results.append(panel);
    await Promise.all(candidates.map(async (c) => {
      const row = WNL.ui.createRow(c);
      list.append(row);
      const res = await WNL.resolve(c, settings);
      if (id !== runId) return;
      if (c.confidence !== 'high' && res.status !== 'found') { row.remove(); return; }
      WNL.ui.fillRow(row, c, res);
    }));
    if (id === runId && !list.children.length) {
      results.innerHTML = '<div class="empty">Ничего не найдено на Raider.IO.</div>';
    }
  }

  text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  text.focus();
})();
