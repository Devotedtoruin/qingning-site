(() => {
  'use strict';

  // Classical lines retain their real author/work. All other lines are site originals.
  // Keep the first original in sync with the meaningful, script-free brand fallback.
  const quotes = Object.freeze([
    Object.freeze({ text: '把日子过成留白，把发现写成文章。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '欲穷千里目，更上一层楼。', author: '王之涣', work: '《登鹳雀楼》' }),
    Object.freeze({ text: '窗外的风很轻，手边的书正好。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '把远处的风景，收进眼前的文字。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '山重水复疑无路，柳暗花明又一村。', author: '陆游', work: '《游山西村》' }),
    Object.freeze({ text: '雨落在窗沿，思绪停在字里。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '借一页纸，留住片刻的晴朗。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '行到水穷处，坐看云起时。', author: '王维', work: '《终南别业》' }),
    Object.freeze({ text: '日子不必太满，文字自有回声。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '翻过这一页，还有新的风景。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '沉舟侧畔千帆过，病树前头万木春。', author: '刘禹锡', work: '《酬乐天扬州初逢席上见赠》' }),
    Object.freeze({ text: '把零散的发现，慢慢连成小径。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '寻常的一天，也有值得记下的光。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '一蓑烟雨任平生。', author: '苏轼', work: '《定风波·莫听穿林打叶声》' }),
    Object.freeze({ text: '晚风翻动书页，灯火照见字句。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '给忙碌留一道缝，让风与光经过。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '明月松间照，清泉石上流。', author: '王维', work: '《山居秋暝》' }),
    Object.freeze({ text: '小小的发现，也能照亮一个午后。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '有些答案，藏在不经意的停顿里。', author: '青柠小站', work: '本站原创' }),
    Object.freeze({ text: '把眼前看仔细，让文字慢慢落下。', author: '青柠小站', work: '本站原创' })
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

  function calendarInfo(date) {
    const parts = localDateInfo(date);
    if (!parts) return null;
    const leap = parts.year % 4 === 0 && (parts.year % 100 !== 0 || parts.year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][parts.month - 1];
    // Derive the first weekday from today's calendar fields; no elapsed local hours.
    const leading = (date.getDay() + 6 - ((parts.day - 1) % 7) + 7) % 7;
    const cells = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => {
      const day = index - leading + 1;
      return day >= 1 && day <= days ? day : null;
    });
    return { ...parts, monthLabel: `${parts.year}年${parts.month}月`, leading, days, cells };
  }

  function quoteSource(quote) {
    return `${quote.author} · ${quote.work}`;
  }

  function initQuote(doc, view, now = () => new Date()) {
    const documentRoot = doc.documentElement;
    if (!documentRoot || documentRoot.hasAttribute('data-quotes-ready')) return false;
    const instances = Array.from(doc.querySelectorAll('[data-quote-instance]')).map((root) => ({
      text: root.querySelector('[data-quote-text]'),
      source: root.querySelector('[data-quote-source]')
    })).filter(({ text, source }) => text && source);
    const calendars = Array.from(doc.querySelectorAll('[data-calendar]')).map((root) => ({
      root,
      date: root.querySelector('[data-calendar-date]'),
      month: root.querySelector('[data-calendar-month]'),
      grid: root.querySelector('[data-calendar-grid]')
    })).filter(({ date, month, grid }) => date && month && grid);
    if (!instances.length && !calendars.length) return false;
    const controls = instances.length ? Array.from(doc.querySelectorAll('[data-quote-next]')) : [];
    const announcement = doc.querySelector('[data-quote-announcement]');
    let index = 0;
    let dateKey = null;

    const renderQuote = (announce = false) => {
      const quote = quotes[index];
      for (const { text, source } of instances) {
        text.textContent = quote.text;
        source.textContent = quoteSource(quote);
        source.setAttribute('title', quoteSource(quote));
      }
      if (announce && announcement) announcement.textContent = `${quote.text}——${quoteSource(quote)}`;
    };
    const renderCalendar = (info) => {
      for (const { root, date, month, grid } of calendars) {
        root.hidden = !info;
        if (!info) continue;
        date.dateTime = info.key;
        date.textContent = info.label;
        date.setAttribute('aria-label', `本地日期：${info.label}`);
        month.textContent = info.monthLabel;
        grid.textContent = '';
        grid.setAttribute('aria-label', `${info.monthLabel}（本地日期）`);
        for (const day of info.cells) {
          const cell = doc.createElement('li');
          if (day === null) {
            cell.className = 'calendar-blank';
            cell.setAttribute('aria-hidden', 'true');
          } else {
            cell.setAttribute('role', 'listitem');
            const time = doc.createElement('time');
            time.dateTime = `${info.key.slice(0, -2)}${String(day).padStart(2, '0')}`;
            time.textContent = String(day);
            time.setAttribute('aria-label', `${info.year}年${info.month}月${day}日${day === info.day ? '，今天' : ''}`);
            if (day === info.day) time.setAttribute('aria-current', 'date');
            cell.appendChild(time);
          }
          grid.appendChild(cell);
        }
      }
    };
    const refreshDay = () => {
      const date = now();
      const parts = localDateInfo(date);
      if (!parts) {
        dateKey = null;
        renderCalendar(null);
        return;
      }
      if (parts.key === dateKey) return;
      dateKey = parts.key;
      index = dailyIndex(date);
      renderQuote();
      renderCalendar(calendarInfo(date));
    };

    refreshDay();
    if (controls.length) doc.addEventListener('click', (event) => {
      const target = event.target;
      const control = target && typeof target.closest === 'function' ? target.closest('[data-quote-next]') : null;
      if (!controls.includes(control) || control.hidden || control.disabled) return;
      refreshDay();
      index = nextIndex(index);
      renderQuote(true);
    });
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') refreshDay();
    });
    if (view && typeof view.addEventListener === 'function') view.addEventListener('pageshow', refreshDay);
    documentRoot.setAttribute('data-quotes-ready', '');
    for (const control of controls) control.hidden = false;
    return true;
  }

  // No browser globals added. CommonJS exports support the dependency-free Node tests.
  if (typeof module === 'object' && module.exports) {
    module.exports = Object.freeze({ quotes, localDateInfo, dailyIndex, nextIndex, calendarInfo, initQuote });
  }
  if (typeof document !== 'undefined') initQuote(document, typeof window === 'undefined' ? null : window);
})();
