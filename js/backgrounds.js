/* Build-owned finite background choices; storage never carries a URL. */
(() => {
  'use strict';
  const config = {"version":1,"default":"mist","choices":[{"id":"mist","label":"雾林","enabled":true,"src":"/images/backgrounds/mist-forest.webp","source":"journal-generated-art","position":"center"},{"id":"night","label":"夜岭","enabled":true,"src":"/images/backgrounds/night-ridge.webp","source":"journal-generated-art","position":"center"},{"id":"paper","label":"纸庭","enabled":true,"src":"/images/backgrounds/paper-garden.webp","source":"journal-generated-art","position":"center"}]};
  config.choices.forEach(Object.freeze); Object.freeze(config.choices);
  window.JournalBackgrounds = Object.freeze(config);
  let selected = config.default;
  try { const saved = window.localStorage.getItem('qingning.background'); if (config.choices.some(choice => choice.enabled && choice.id === saved)) selected = saved; } catch (_) { /* default when storage is denied */ }
  document.documentElement.setAttribute('data-background', selected);
})();
