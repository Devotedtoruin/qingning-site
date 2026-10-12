(() => {
  'use strict';
  const KEY = 'qingning.panelTransparency';
  const DEFAULT = 18;
  const MIN = 0;
  const MAX = 45;
  const root = document.documentElement;
  let range = null;
  let output = null;

  // A single integer, not JSON, CSS, or an object. Invalid data never reaches style.
  const parse = (raw) => {
    if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) return DEFAULT;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? Math.max(MIN, Math.min(MAX, value)) : DEFAULT;
  };
  let current = DEFAULT;
  try { current = parse(window.localStorage.getItem(KEY)); } catch (_) { /* denied storage: default */ }

  const apply = (value) => {
    current = value;
    // Only content surfaces use this value; the photograph and veil stay unchanged.
    root.style.setProperty('--panel-alpha', (1 - current / 100).toFixed(2));
    if (range) {
      range.value = String(current);
      range.setAttribute('aria-valuetext', current + '%');
    }
    if (output) output.value = current + '%';
  };
  apply(current); // Runs in <head>, before the first body paint.

  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
    } catch (_) { return; }
    apply(event.key === null ? DEFAULT : parse(event.newValue));
  });

  const mount = () => {
    range = document.querySelector('[data-appearance-range]');
    output = document.getElementById('appearance-value');
    apply(current);
    if (range) range.addEventListener('input', () => {
      apply(parse(range.value));
      try { window.localStorage.setItem(KEY, String(current)); } catch (_) { /* session-only setting */ }
    });
    const reset = document.querySelector('[data-appearance-reset]');
    if (reset) reset.addEventListener('click', () => {
      try { window.localStorage.removeItem(KEY); } catch (_) { /* still reset the current page */ }
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
