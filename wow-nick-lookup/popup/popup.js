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
