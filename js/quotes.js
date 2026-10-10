(() => {
  'use strict';

  // The brand quotation is static HTML. This file only enhances the local calendar.
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function localDateInfo(date) {
    if (Object.prototype.toString.call(date) !== '[object Date]' || !Number.isFinite(date.getTime())) return null;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, key, label: `${year}年${month}月${day}日 ${weekdays[date.getDay()]}` };
  }

  function formatClock(date) {
    if (!localDateInfo(date)) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function calendarInfo(date) {
    const parts = localDateInfo(date);
    if (!parts) return null;
    const leap = parts.year % 4 === 0 && (parts.year % 100 !== 0 || parts.year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][parts.month - 1];
    // Derive the first weekday from calendar fields, not elapsed hours across DST.
    const leading = (date.getDay() + 6 - ((parts.day - 1) % 7) + 7) % 7;
    const cells = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => {
      const day = index - leading + 1;
      return day >= 1 && day <= days ? day : null;
    });
    return { ...parts, monthLabel: `${parts.year}年${parts.month}月`, leading, days, cells };
  }

  function initCalendar(doc, view, now = () => new Date()) {
    const documentRoot = doc && doc.documentElement;
    if (!documentRoot || documentRoot.hasAttribute('data-calendar-ready')) return false;
    const calendars = Array.from(doc.querySelectorAll('[data-calendar]')).map((root) => ({
      root,
      date: root.querySelector('[data-calendar-date]'),
      month: root.querySelector('[data-calendar-month]'),
      grid: root.querySelector('[data-calendar-grid]'),
      clock: root.querySelector('[data-clock]')
    })).filter(({ date, month, grid, clock }) => date && month && grid && clock);
    if (!calendars.length) return false;

    let dateKey = null;
    let timer = null;
    let pageActive = true;
    const isVisible = () => pageActive && doc.visibilityState !== 'hidden';
    const stopTimer = () => {
      if (timer !== null && view && typeof view.clearTimeout === 'function') view.clearTimeout(timer);
      timer = null;
    };
    const renderCalendar = (info) => {
      for (const { date, month, grid } of calendars) {
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
    const refresh = (date) => {
      const parts = localDateInfo(date);
      if (!parts) {
        dateKey = null;
        for (const { root } of calendars) root.hidden = true;
        return;
      }
      if (dateKey !== parts.key) {
        renderCalendar(calendarInfo(date));
        dateKey = parts.key;
      }
      const text = formatClock(date);
      const offset = -date.getTimezoneOffset();
      const zone = `UTC${offset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
      for (const { root, clock } of calendars) {
        root.hidden = false;
        if (clock.textContent !== text) clock.textContent = text;
        clock.dateTime = text;
        clock.setAttribute('aria-live', 'off');
        clock.setAttribute('aria-label', `本地时间（浏览器时区，${zone}）：${text}`);
      }
    };
    const tick = () => {
      stopTimer();
      if (!isVisible()) return;
      const date = now();
      refresh(date);
      if (view && typeof view.setTimeout === 'function' && typeof view.clearTimeout === 'function') {
        // One timeout aligned to the next minute; never a seconds ticker.
        const delay = localDateInfo(date) ? 60000 - ((date.getTime() % 60000 + 60000) % 60000) : 60000;
        timer = view.setTimeout(tick, delay);
      }
    };

    documentRoot.setAttribute('data-calendar-ready', '');
    doc.addEventListener('visibilitychange', () => {
      if (isVisible()) tick();
      else stopTimer();
    });
    if (view && typeof view.addEventListener === 'function') {
      view.addEventListener('pagehide', () => { pageActive = false; stopTimer(); });
      view.addEventListener('pageshow', () => { pageActive = true; tick(); });
    }
    tick();
    return true;
  }

  // No browser globals. CommonJS exports support dependency-free, offline tests.
  if (typeof module === 'object' && module.exports) {
    module.exports = Object.freeze({ localDateInfo, calendarInfo, formatClock, initCalendar });
  }
  if (typeof document !== 'undefined') initCalendar(document, typeof window === 'undefined' ? null : window);
})();
