(() => {
  'use strict';
  const KEY = 'qingning.panelTransparency';
  const APPEARANCE_KEY = 'qingning.appearance';
  const BACKGROUND_KEY = 'qingning.background';
  const APPEARANCES = ['glass', 'paper', 'night'];
  const BACKGROUNDS = ['forest', 'gradient', 'illustration'];
  const DEFAULT = 18;
  const MIN = 0;
  const MAX = 45;
  const root = document.documentElement;
  const reduced = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-transparency: reduce)') : null;
  let range = null, output = null, help = null;
  let explicit = false;
  const valid = raw => typeof raw === 'string' && /^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw));
  const parse = raw => valid(raw) ? Math.max(MIN, Math.min(MAX, Number(raw))) : DEFAULT;
  const enumValue = (raw, values) => values.includes(raw) ? raw : values[0];
  const read = key => { try { return window.localStorage.getItem(key); } catch (_) { return null; } };
  const save = (key, value) => { try { window.localStorage.setItem(key, value); } catch (_) { /* session-only choice */ } };
  const stored = read(KEY);
  let current = parse(stored);
  explicit = valid(stored);
  let appearance = enumValue(read(APPEARANCE_KEY), APPEARANCES);
  let background = enumValue(read(BACKGROUND_KEY), BACKGROUNDS);

  const apply = value => {
    current = value;
    root.style.setProperty('--panel-alpha', (1 - current / 100).toFixed(2));
    root.setAttribute('data-panel-preference', explicit ? 'custom' : 'system');
    root.setAttribute('data-appearance', appearance);
    root.setAttribute('data-background', background);
    document.querySelectorAll('[data-appearance-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute('data-appearance-choice') === appearance)));
    document.querySelectorAll('[data-background-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute('data-background-choice') === background)));
    if (range) { range.value = String(current); range.setAttribute('aria-valuetext', current + '%'); }
    if (output) output.value = current + '%';
    if (help) help.textContent = appearance === 'paper'
      ? '纸页外观使用实色；透明度偏好仍会保留，切回玻璃或夜色后生效。'
      : !explicit && reduced && reduced.matches
        ? '已遵循系统减少透明度设置，当前使用实色。移动滑杆可主动启用玻璃效果；恢复默认重新遵循系统。'
        : '0% 为实色纸面；只调整内容面板，不改变背景照片或文字清晰度。恢复默认遵循系统偏好。';
  };
  apply(current);
  window.addEventListener('storage', event => {
    if (![KEY, APPEARANCE_KEY, BACKGROUND_KEY, null].includes(event.key)) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch (_) { return; }
    if (event.key === null) { explicit = false; current = DEFAULT; appearance = 'glass'; background = 'forest'; }
    if (event.key === KEY) { explicit = valid(event.newValue); current = parse(event.newValue); }
    if (event.key === APPEARANCE_KEY) appearance = enumValue(event.newValue, APPEARANCES);
    if (event.key === BACKGROUND_KEY) background = enumValue(event.newValue, BACKGROUNDS);
    apply(current);
  });
  if (reduced && typeof reduced.addEventListener === 'function') reduced.addEventListener('change', () => apply(current));
  const mount = () => {
    range = document.querySelector('[data-appearance-range]');
    output = document.getElementById('appearance-value');
    help = document.getElementById('appearance-help');
    apply(current);
    if (range) range.addEventListener('input', () => { explicit = true; apply(parse(range.value)); save(KEY, String(current)); });
    for (const [attribute, values, key] of [['data-appearance-choice', APPEARANCES, APPEARANCE_KEY], ['data-background-choice', BACKGROUNDS, BACKGROUND_KEY]]) {
      document.querySelectorAll('[' + attribute + ']').forEach(button => button.addEventListener('click', () => {
        const value = button.getAttribute(attribute);
        if (!values.includes(value)) return;
        if (key === APPEARANCE_KEY) appearance = value; else background = value;
        apply(current); save(key, value);
      }));
    }
    const reset = document.querySelector('[data-appearance-reset]');
    if (reset) reset.addEventListener('click', () => {
      explicit = false; appearance = 'glass'; background = 'forest';
      for (const key of [KEY, APPEARANCE_KEY, BACKGROUND_KEY]) { try { window.localStorage.removeItem(key); } catch (_) { /* still reset this page */ } }
      apply(DEFAULT);
    });
    const controls = document.querySelector('[data-appearance-controls]');
    if (controls) controls.addEventListener('keydown', event => {
      if (event.key === 'Escape' && controls.open) { controls.open = false; const summary = controls.querySelector('summary'); if (summary) summary.focus(); }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
