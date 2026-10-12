(() => {
  'use strict';
  const KEY = 'qingning.panelTransparency';
  const DEFAULT = 18;
  const MIN = 0;
  const MAX = 45;
  const root = document.documentElement;
  const reduced = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-transparency: reduce)') : null;
  let range = null;
  let output = null;
  let help = null;
  let explicit = false;
  const valid = (raw) => typeof raw === 'string' && /^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw));
  const parse = (raw) => valid(raw) ? Math.max(MIN, Math.min(MAX, Number(raw))) : DEFAULT;
  let current = DEFAULT;
  try {
    const stored = window.localStorage.getItem(KEY);
    explicit = valid(stored);
    current = parse(stored);
  } catch (_) { /* denied storage: follow system preference */ }

  const apply = (value) => {
    current = value;
    root.style.setProperty('--panel-alpha', (1 - current / 100).toFixed(2));
    root.setAttribute('data-panel-preference', explicit ? 'custom' : 'system');
    if (range) {
      range.value = String(current);
      range.setAttribute('aria-valuetext', current + '%');
    }
    if (output) output.value = current + '%';
    if (help) help.textContent = !explicit && reduced && reduced.matches
      ? '已遵循系统减少透明度设置，当前使用实色。移动滑杆可主动启用玻璃效果；恢复默认重新遵循系统。'
      : '0% 为实色纸面；只调整内容面板，不改变背景照片或文字清晰度。恢复默认遵循系统偏好。';
  };
  apply(current);

  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch (_) { return; }
    explicit = event.key !== null && valid(event.newValue);
    apply(event.key === null ? DEFAULT : parse(event.newValue));
  });
  if (reduced && typeof reduced.addEventListener === 'function') reduced.addEventListener('change', () => apply(current));

  const mount = () => {
    range = document.querySelector('[data-appearance-range]');
    output = document.getElementById('appearance-value');
    help = document.getElementById('appearance-help');
    apply(current);
    if (range) range.addEventListener('input', () => {
      explicit = true;
      apply(parse(range.value));
      try { window.localStorage.setItem(KEY, String(current)); } catch (_) { /* session-only choice */ }
    });
    const reset = document.querySelector('[data-appearance-reset]');
    if (reset) reset.addEventListener('click', () => {
      explicit = false;
      try { window.localStorage.removeItem(KEY); } catch (_) { /* still reset current page */ }
      apply(DEFAULT);
    });
    const controls = document.querySelector('[data-appearance-controls]');
    if (controls) controls.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && controls.open) {
        controls.open = false;
        const summary = controls.querySelector('summary');
        if (summary) summary.focus();
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
