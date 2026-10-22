/* 青柠小站 · 外观偏好
   两个互相独立的选择：配色（浅色 / 深色 / 跟随系统）与首页横幅图片。
   本文件在 <head> 同步执行，先恢复偏好再绘制，避免闪烁。
   只接受有限枚举；横幅图片白名单来自构建生成的 JournalBackgrounds。 */
(() => {
  'use strict';
  const SCHEME_KEY = 'qingning.scheme';
  const BACKGROUND_KEY = 'qingning.background';
  const TRANSPARENCY_KEY = 'qingning.panelTransparency';
  const MODE_KEY = 'qingning.panelMode';
  const LEGACY_KEYS = ['qingning.appearance'];
  const TRANSPARENCY_MIN = 0;
  const TRANSPARENCY_MAX = 90;
  const TRANSPARENCY_DEFAULT = 30;
  const SCHEMES = ['light', 'dark', 'system'];
  const config = window.JournalBackgrounds;
  const enabled = config ? config.choices.filter(choice => choice.enabled).map(choice => choice.id) : [];
  const BACKGROUNDS = enabled.length ? enabled : ['none'];
  const defaultBackground = config && enabled.includes(config.default) ? config.default : BACKGROUNDS[0];
  const root = document.documentElement;
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const reducedTransparency = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-transparency: reduce)') : null;
  const supported = typeof window.CSS === 'undefined' || typeof window.CSS.supports !== 'function' ? true
    : window.CSS.supports('backdrop-filter', 'blur(1px)') || window.CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  let range = null; let output = null; let help = null;
  const read = key => { try { return window.localStorage.getItem(key); } catch (_) { return null; } };
  const save = (key, value) => { try { window.localStorage.setItem(key, value); } catch (_) { /* session-only choice */ } };
  const remove = key => { try { window.localStorage.removeItem(key); } catch (_) { /* nothing stored */ } };
  const enumValue = (raw, values, fallback) => values.includes(raw) ? raw : fallback;
  // Old "night" appearance becomes the dark scheme; glass/paper map to the default.
  const legacyScheme = () => read('qingning.appearance') === 'night' ? 'dark' : null;
  let scheme = enumValue(read(SCHEME_KEY) || legacyScheme(), SCHEMES, 'system');
  let background = enumValue(read(BACKGROUND_KEY), BACKGROUNDS, defaultBackground);
  // 透明度：整数 0-90，缺省 45（= 底色 alpha 0.55）；不支持滤镜时保留此偏好并回落实色。
  const transparencyValue = raw => typeof raw === 'string' && /^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw))
    ? Math.min(TRANSPARENCY_MAX, Math.max(TRANSPARENCY_MIN, Number(raw))) : null;
  const storedTransparency = transparencyValue(read(TRANSPARENCY_KEY));
  let transparency = storedTransparency === null ? TRANSPARENCY_DEFAULT : storedTransparency;
  let explicit = storedTransparency !== null;
  let mode = read(MODE_KEY) === 'system' ? 'system' : 'custom';

  const effectiveScheme = () => scheme === 'system' ? (media && media.matches ? 'dark' : 'light') : scheme;
  const apply = () => {
    root.setAttribute('data-scheme', effectiveScheme());
    root.setAttribute('data-scheme-preference', scheme);
    root.setAttribute('data-background', background);
    // 只写底色 alpha；文字与背景照片不参与，README/WRITING 的契约。
    const followingSystem = mode === 'system';
    const solid = followingSystem && reducedTransparency && reducedTransparency.matches;
    root.setAttribute('data-panel-preference', followingSystem ? 'system' : 'custom');
    root.style.setProperty('--panel-alpha', solid ? '1' : (1 - transparency / 100).toFixed(2));
    if (range) { range.value = String(transparency); range.setAttribute('aria-valuetext', transparency + '%'); }
    if (output) output.value = transparency + '%';
    if (range) range.disabled = solid;
    if (help) help.textContent = solid
      ? '已跟随系统减少透明度，当前使用实色；选择“自定义”可重新调节。'
      : (supported ? '0% 为实色面板；只调整内容面板底色，不改变背景照片或文字清晰度。'
        : '当前浏览器不支持背景滤镜，面板使用实色；透明度偏好仍会保存。');
    document.querySelectorAll('[data-appearance-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute('data-appearance-choice') === scheme)));
    document.querySelectorAll('[data-background-choice]').forEach(button => button.setAttribute('aria-pressed', String(!button.disabled && button.getAttribute('data-background-choice') === background)));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectiveScheme() === 'dark' ? '#131512' : '#f3f4ef');
  };
  apply();
  if (media && typeof media.addEventListener === 'function') media.addEventListener('change', () => { if (scheme === 'system') apply(); });
  // 系统减少透明度偏好变化时，只有显式“跟随系统”的透明度才需要重新计算。
  if (reducedTransparency && typeof reducedTransparency.addEventListener === 'function') {
    reducedTransparency.addEventListener('change', () => { if (mode === 'system') apply(); });
  }
  window.addEventListener('storage', event => {
    if (![SCHEME_KEY, BACKGROUND_KEY, TRANSPARENCY_KEY, MODE_KEY, null].includes(event.key)) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch (_) { return; }
    if (event.key === null) { scheme = 'system'; background = defaultBackground; transparency = TRANSPARENCY_DEFAULT; explicit = false; mode = 'custom'; }
    if (event.key === TRANSPARENCY_KEY) { const next = transparencyValue(event.newValue); explicit = next !== null; transparency = next === null ? TRANSPARENCY_DEFAULT : next; if (next !== null) mode = 'custom'; }
    if (event.key === MODE_KEY) mode = event.newValue === 'system' ? 'system' : 'custom';
    if (event.key === SCHEME_KEY) scheme = enumValue(event.newValue, SCHEMES, 'system');
    if (event.key === BACKGROUND_KEY) background = enumValue(event.newValue, BACKGROUNDS, defaultBackground);
    apply();
  });

  let mounted = false;
  const mount = () => {
    if (mounted) return;
    mounted = true;
    range = document.querySelector('[data-appearance-range]');
    output = document.getElementById('appearance-value');
    help = document.getElementById('appearance-help');
    apply();
    // 拖动滑杆即显式选择“自定义”透明度；数值经 0-90 夹取后才写入偏好。
    if (range) range.addEventListener('input', () => {
      const next = transparencyValue(range.value);
      if (next === null) { apply(); return; }
      transparency = next;
      explicit = true;
      mode = 'custom';
      apply();
      save(TRANSPARENCY_KEY, String(next));
      save(MODE_KEY, 'custom');
    });
    for (const [attribute, values, key] of [['data-appearance-choice', SCHEMES, SCHEME_KEY], ['data-background-choice', BACKGROUNDS, BACKGROUND_KEY]]) {
      document.querySelectorAll('[' + attribute + ']').forEach(button => button.addEventListener('click', () => {
        const value = button.getAttribute(attribute);
        if (button.disabled || !values.includes(value)) return;
        if (key === SCHEME_KEY) scheme = value; else background = value;
        // 选择“跟随系统”配色时，透明度一并跟随系统的减少透明度偏好。
        if (key === SCHEME_KEY && value === 'system') { mode = 'system'; save(MODE_KEY, 'system'); }
        if (key === SCHEME_KEY && value !== 'system' && mode === 'system') { mode = 'custom'; save(MODE_KEY, 'custom'); }
        apply(); save(key, value);
        LEGACY_KEYS.forEach(remove);
      }));
    }
    const reset = document.querySelector('[data-appearance-reset]');
    if (reset) reset.addEventListener('click', () => {
      scheme = 'system'; background = defaultBackground;
      transparency = TRANSPARENCY_DEFAULT; explicit = false; mode = 'custom';
      [SCHEME_KEY, BACKGROUND_KEY, TRANSPARENCY_KEY, MODE_KEY, ...LEGACY_KEYS].forEach(remove);
      apply();
    });
    const controls = document.querySelector('[data-appearance-controls]');
    if (controls && window.JournalUI) {
      const trigger = controls.querySelector('summary'), panel = controls.querySelector('.appearance-panel');
      const setOpen = open => { controls.open = open; trigger.setAttribute('aria-expanded', String(open)); };
      setOpen(controls.open);
      controls.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(controls.open)));
      window.JournalUI.register(document, window, { root: controls, trigger, panel, isOpen: () => controls.open, setOpen });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
