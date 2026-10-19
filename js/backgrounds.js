/* Build-owned finite background choices; storage never carries a URL. */
(() => {
  'use strict';
  const config = {"version":1,"default":"forest","choices":[{"id":"forest","label":"林间晨光","enabled":true,"src":"/images/backgrounds/qingning-4k-b.jpg","source":"pexels-lake-sunrise","position":"center"},{"id":"wallpaper2","label":"山湖倒影","enabled":false,"src":"","source":"","position":"center"},{"id":"wallpaper3","label":"晨曦山峦","enabled":false,"src":"","source":"","position":"center"},{"id":"wallpaper4","label":"宇宙星云","enabled":false,"src":"","source":"","position":"center"},{"id":"wallpaper6","label":"海洋波浪","enabled":false,"src":"","source":"","position":"center"},{"id":"wallpaper7","label":"夏日海滨","enabled":false,"src":"","source":"","position":"center"},{"id":"wallpaper8","label":"动漫夏日","enabled":false,"src":"","source":"","position":"center"}]};
  config.choices.forEach(Object.freeze); Object.freeze(config.choices);
  window.JournalBackgrounds = Object.freeze(config);
  let selected = config.default;
  try { const saved = window.localStorage.getItem('qingning.background'); if (config.choices.some(choice => choice.enabled && choice.id === saved)) selected = saved; } catch (_) { /* default when storage is denied */ }
  document.documentElement.setAttribute('data-background', selected);
})();
