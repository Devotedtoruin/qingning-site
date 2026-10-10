(() => {
  'use strict';

  // Public-domain lines, kept local with their author and source work.
  const quotes = Object.freeze([
    Object.freeze({ text: '欲穷千里目，更上一层楼。', author: '王之涣', work: '《登鹳雀楼》' }),
    Object.freeze({ text: '山重水复疑无路，柳暗花明又一村。', author: '陆游', work: '《游山西村》' }),
    Object.freeze({ text: '沉舟侧畔千帆过，病树前头万木春。', author: '刘禹锡', work: '《酬乐天扬州初逢席上见赠》' })
  ]);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function localDateInfo(date) {
    if (Object.prototype.toString.call(date) !== '[object Date]' || !Number.isFinite(date.getTime())) return null;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, key, label: `${year}年${month}月${day}日 ${weekdays[date.getDay()]}` };
  }

  function dailyIndex(date, count = quotes.length) {
    const parts = localDateInfo(date);
    if (!parts || !Number.isSafeInteger(count) || count < 1) return 0;
    // Use the visitor's calendar fields, not elapsed local hours (DST) or a UTC date string.
    // The UTC container is only for day arithmetic; setUTCFullYear also handles years 0–99.
    const calendar = new Date(0);
    calendar.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    const day = Math.floor(calendar.getTime() / 86400000);
    return ((day % count) + count) % count;
  }

  function nextIndex(index, count = quotes.length) {
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || count < 1) return 0;
    return (((index % count) + count) % count + 1) % count;
  }

  function initQuote(doc, view, now = () => new Date()) {
    const root = doc.querySelector('[data-daily-quote]');
    if (!root || root.hasAttribute('data-quote-ready')) return false;
    const text = root.querySelector('[data-quote-text]');
    const author = root.querySelector('[data-quote-author]');
    const work = root.querySelector('[data-quote-work]');
    const dateNode = root.querySelector('[data-quote-date]');
    const next = root.querySelector('[data-quote-next]');
    const announcement = root.querySelector('[data-quote-announcement]');
    if (!text || !author || !work || !dateNode || !next || !announcement) return false;

    let index = 0;
    let dateKey = null;
    const renderQuote = (announce = false) => {
      const quote = quotes[index];
      text.textContent = quote.text;
      author.textContent = quote.author;
      work.textContent = quote.work;
      if (announce) announcement.textContent = `${quote.text}——${quote.author}${quote.work}`;
    };
    const refreshDay = () => {
      const date = now();
      const parts = localDateInfo(date);
      if (!parts || parts.key === dateKey) return;
      dateKey = parts.key;
      index = dailyIndex(date);
      dateNode.dateTime = parts.key;
      dateNode.textContent = parts.label;
      dateNode.setAttribute('aria-label', `本地日期：${parts.label}`);
      dateNode.hidden = false;
      renderQuote();
    };

    refreshDay();
    next.addEventListener('click', () => {
      refreshDay();
      index = nextIndex(index);
      renderQuote(true);
    });
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') refreshDay();
    });
    if (view && typeof view.addEventListener === 'function') view.addEventListener('pageshow', refreshDay);
    root.setAttribute('data-quote-ready', '');
    next.hidden = false;
    return true;
  }

  // No browser globals added. CommonJS exports support the dependency-free Node tests.
  if (typeof module === 'object' && module.exports) {
    module.exports = Object.freeze({ quotes, localDateInfo, dailyIndex, nextIndex, initQuote });
  }
  if (typeof document !== 'undefined') initQuote(document, typeof window === 'undefined' ? null : window);
})();
