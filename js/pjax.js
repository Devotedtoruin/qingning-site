/* 青柠小站 · 局部刷新（PJAX）
   只替换 <main> 和页面元信息，让页脚音乐等全局 UI 保持在同一份 DOM。 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    const api = factory();
    root.JournalPjax = api;
    const start = () => api.mount(root.document, root);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const MAIN = 'main';
  const PHOTO_SWIPE = '/vendor/photoswipe-5.4.4/';

  function isPjaxLink(anchor, event, origin, currentPath, currentSearch = '') {
    if (!anchor || !anchor.href || event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.getAttribute('rel') && /\bexternal\b/.test(anchor.getAttribute('rel'))) return false;
    let url;
    try { url = new URL(anchor.href, origin); } catch (_) { return false; }
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin) return false;
    // Same-page TOC/hash navigation belongs to the browser and article script.
    if (url.pathname === currentPath && url.search === currentSearch) return false;
    return true;
  }

  function previousPage(value, origin, currentUrl) {
    if (!value) return null;
    try {
      const url = new URL(value, origin);
      const current = new URL(currentUrl, origin);
      return /^https?:$/.test(url.protocol) && url.origin === origin &&
        (url.pathname !== current.pathname || url.search !== current.search) ? url.href : null;
    } catch (_) { return null; }
  }

  function mount(document, window) {
    if (!document || !window || !window.fetch || typeof window.DOMParser !== 'function') return null;
    if (document.__journalPjaxMounted) return null;
    document.__journalPjaxMounted = true;

    const origin = window.location.origin;
    const positions = new Map();
    const byUrl = new Map();
    const id = () => String(Date.now()) + '-' + String(Math.random());
    const stateData = (state, url) => {
      const entry = state && state.__journalPjax;
      return entry && entry.id && entry.url === url ? entry : null;
    };
    const historyState = (entry) => ({
      ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
      __journalPjax: { ...entry }
    });
    const remember = (entry) => {
      positions.set(entry.id, entry);
      byUrl.set(entry.url, entry);
    };
    let current = stateData(window.history.state, window.location.href) || {
      id: id(), url: window.location.href,
      from: previousPage(document.referrer, origin, window.location.href),
      internal: false, scrollY: window.scrollY || 0
    };
    remember(current);
    window.history.replaceState(historyState(current), '', current.url);
    window.history.scrollRestoration = 'manual';

    const setBackLink = () => {
      const anchor = document.querySelector('[data-article-back]');
      if (!anchor) return;
      const from = previousPage(current.from, origin, current.url);
      if (from) {
        const url = new URL(from);
        anchor.setAttribute('href', url.pathname + url.search + url.hash);
      }
      // Without a known same-origin predecessor, keep the server-rendered /articles/ href.
    };
    setBackLink();

    window.addEventListener('scroll', () => {
      current.scrollY = Math.max(0, window.scrollY || 0);
      remember(current);
    }, { passive: true });

    let inflight = null;
    let navigationId = 0;
    let vendorPromise = null;
    const loadScript = (src, ready) => {
      if (ready()) return Promise.resolve(true);
      return new Promise((resolve) => {
        const script = document.createElement('script');
        let completed = false;
        const finish = (ok) => {
          if (completed) return;
          completed = true;
          window.clearTimeout(timer);
          if (!ok && script.parentNode) script.parentNode.removeChild(script);
          resolve(ok);
        };
        const timer = window.setTimeout(() => finish(false), 5000);
        script.src = new URL(src, origin).href;
        script.onload = () => finish(ready());
        script.onerror = () => finish(false);
        document.head.appendChild(script);
      });
    };
    const ensurePostVendor = (doc) => {
      if (!doc.querySelector('link[href*="photoswipe"]')) return Promise.resolve();
      if (!vendorPromise) {
        vendorPromise = loadScript(PHOTO_SWIPE + 'photoswipe.umd.min.js', () => typeof window.PhotoSwipe === 'function')
          .then((ok) => ok && loadScript(PHOTO_SWIPE + 'photoswipe-lightbox.umd.min.js', () => typeof window.PhotoSwipeLightbox === 'function'))
          .then((ok) => { if (!ok) vendorPromise = null; });
      }
      return vendorPromise;
    };

    const remount = () => {
      if (window.JournalSite && typeof window.JournalSite.mountPage === 'function') window.JournalSite.mountPage(document, window);
      if (window.JournalMedia && typeof window.JournalMedia.mount === 'function') window.JournalMedia.mount(document, window);
      if (window.JournalSearch && typeof window.JournalSearch.mount === 'function') window.JournalSearch.mount(document, window);
    };

    const apply = (doc) => {
      const nextMain = doc.querySelector(MAIN);
      const oldMain = document.querySelector(MAIN);
      if (!nextMain || !oldMain) return false;
      oldMain.replaceWith(nextMain);
      const nextTitle = doc.querySelector('title');
      if (nextTitle) document.title = nextTitle.textContent;
      const sync = (selector, attr) => {
        const next = doc.querySelector(selector);
        const old = document.querySelector(selector);
        if (next && old) old.setAttribute(attr, next.getAttribute(attr));
        else if (next && !old) document.head.appendChild(next);
      };
      sync('link[rel="canonical"]', 'href');
      sync('meta[property="og:url"]', 'content');
      sync('meta[name="description"]', 'content');
      sync('meta[property="og:title"]', 'content');
      sync('meta[property="og:description"]', 'content');
      sync('meta[property="og:type"]', 'content');
      const css = doc.querySelector('link[href*="photoswipe"]');
      if (css && !document.querySelector('link[href*="photoswipe"]')) document.head.appendChild(css);
      document.body.setAttribute('data-layout', (doc.body && doc.body.getAttribute('data-layout')) || '');
      return true;
    };

    const scrollToPage = (url, fresh, top) => {
      const hash = new URL(url).hash;
      if (fresh && hash) {
        let name = hash.slice(1);
        try { name = decodeURIComponent(name); } catch (_) { /* Use the literal fragment. */ }
        const target = document.getElementById(name);
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'auto' });
          return;
        }
      }
      window.scrollTo({ top: fresh ? 0 : top, behavior: 'auto' });
    };

    const load = (url, push, restored = null) => {
      const requestId = ++navigationId;
      if (inflight) inflight.abort();
      const controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
      inflight = controller;
      document.documentElement.classList.add('is-pjaxing');
      return window.fetch(url, { credentials: 'same-origin', signal: controller ? controller.signal : undefined })
        .then((response) => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const type = response.headers.get('content-type') || '';
          if (type && !/text\/html/.test(type)) throw new Error('not html');
          return response.text();
        })
        .then(async (html) => {
          const doc = new window.DOMParser().parseFromString(html, 'text/html');
          if (!doc || !doc.querySelector(MAIN)) throw new Error('no main');
          // The home page never loads these assets. Wait before exposing post links
          // so a first click opens PhotoSwipe rather than the target=_blank original.
          await ensurePostVendor(doc);
          if (requestId !== navigationId) return;
          if (push) {
            current.scrollY = Math.max(0, window.scrollY || 0);
            remember(current);
            window.history.replaceState(historyState(current), '', current.url);
            const next = { id: id(), url, from: current.url, internal: true, scrollY: 0 };
            window.history.pushState({ __journalPjax: next }, '', url);
            current = next;
          } else {
            current = restored || { id: id(), url, from: null, internal: false, scrollY: 0 };
            window.history.replaceState(historyState(current), '', url);
          }
          remember(current);
          if (!apply(doc)) throw new Error('swap failed');
          setBackLink();
          remount();
          scrollToPage(url, push, current.scrollY);
        })
        .catch(() => {
          if (requestId === navigationId) window.location.assign(url);
        })
        .finally(() => {
          if (requestId !== navigationId) return;
          inflight = null;
          document.documentElement.classList.remove('is-pjaxing');
        });
    };

    document.addEventListener('click', (event) => {
      const anchor = event.target && event.target.closest ? event.target.closest('a') : null;
      if (!isPjaxLink(anchor, event, origin, window.location.pathname, window.location.search)) return;
      event.preventDefault();
      const url = new URL(anchor.href, origin).href;
      // An article entered by PJAX has a known previous history entry. Go back
      // rather than pushing another copy of it, preserving its scroll position.
      if (anchor.hasAttribute('data-article-back') && current.internal &&
          previousPage(current.from, origin, current.url) === url) {
        window.history.back();
        return;
      }
      load(url, true);
    });

    window.addEventListener('popstate', (event) => {
      const url = window.location.href;
      const saved = stateData(event.state, url) || byUrl.get(url) ||
        { id: id(), url, from: null, internal: false, scrollY: 0 };
      // The article TOC can replace a state without our payload; the in-memory
      // entry still carries the previous page and scroll position for this URL.
      load(url, false, { ...saved });
    });

    return { load, remount };
  }

  return { mount, isPjaxLink, MAIN };
});
