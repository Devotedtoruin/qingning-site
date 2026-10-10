/* Local search: MiniSearch ranks candidates; literal AND matching preserves Chinese substrings. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JournalSearch = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const normalize = (value) => String(value).normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
  const queryTokens = (value) => [...new Set(normalize(value).split(' ').filter(Boolean))];

  function makeTokenizer(intl = typeof Intl === 'object' ? Intl : null) {
    let segmenter;
    try { if (intl && typeof intl.Segmenter === 'function') segmenter = new intl.Segmenter('zh', { granularity: 'word' }); } catch (_) { /* Older engines use the fallback. */ }
    return (value) => {
      const text = normalize(value);
      if (segmenter) {
        try { return Array.from(segmenter.segment(text)).filter((part) => part.isWordLike).map((part) => part.segment); } catch (_) { /* Fallback is still searchable. */ }
      }
      return text.match(/[a-z0-9_]+|[^\s\x00-\x7f]/gu) || [];
    };
  }

  // Navigation must stay in the canonical local article namespace. Reject encoded
  // separators/dot traversal as well as schemes, host-relative URLs and controls.
  function safePostUrl(value) {
    if (typeof value !== 'string' || !value.startsWith('/posts/') || !value.endsWith('/')
      || /[\s\u0000-\u001f\u007f\\?#<>"']/u.test(value) || /%(?:2f|5c)/i.test(value)) return false;
    let decoded;
    try { decoded = decodeURIComponent(value); } catch (_) { return false; }
    if (/[\s\u0000-\u001f\u007f\\?#<>"'%]/u.test(decoded)) return false;
    const parts = decoded.slice(1, -1).split('/');
    return parts.length >= 2 && parts[0] === 'posts'
      && parts.every((part) => part && part !== '.' && part !== '..' && !part.includes(':'));
  }

  function validateRecords(data) {
    if (!Array.isArray(data)) throw new Error('Invalid search index');
    const seen = new Set();
    return data.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.title !== 'string' || !item.title.trim() || typeof item.content !== 'string'
        || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
        || !safePostUrl(item.url)
        || !Array.isArray(item.tags) || !item.tags.every((value) => typeof value === 'string')
        || !Array.isArray(item.categories) || !item.categories.every((value) => typeof value === 'string')
        || seen.has(item.url)) throw new Error('Invalid search record');
      seen.add(item.url);
      return { title: item.title, content: item.content, date: item.date, url: item.url,
        tags: item.tags.slice(), categories: item.categories.slice() };
    });
  }

  function createIndex(data, MiniSearchClass) {
    const records = validateRecords(data);
    const docs = records.map((record, id) => ({ id, title: normalize(record.title),
      tags: normalize(record.tags.join(' ')), categories: normalize(record.categories.join(' ')),
      content: normalize(record.content) }));
    const haystacks = docs.map((doc) => [doc.title, doc.tags, doc.categories, doc.content].join(' '));
    let library = null;
    try {
      if (typeof MiniSearchClass === 'function') {
        library = new MiniSearchClass({ fields: ['title', 'tags', 'categories', 'content'], tokenize: makeTokenizer(),
          searchOptions: { boost: { title: 6, tags: 3, categories: 2 }, combineWith: 'AND', prefix: false, fuzzy: false } });
        library.addAll(docs);
      }
    } catch (_) { library = null; }

    const engine = { records, mode: library ? 'ranked' : 'basic', search(query, limit = 12) {
      const tokens = queryTokens(query);
      if (!tokens.length) return [];
      const candidates = new Set();
      const scores = new Map();
      if (library) {
        try {
          library.search(normalize(query), { combineWith: 'AND', prefix: false, fuzzy: false }).forEach((match) => {
            if (Number.isInteger(match.id) && docs[match.id]) {
              candidates.add(match.id);
              scores.set(match.id, Number.isFinite(match.score) ? match.score : 0);
            }
          });
        } catch (_) { library = null; engine.mode = 'basic'; }
      }
      // Segmentation boundaries must not hide Chinese substrings, mixed language,
      // literal punctuation, or matches split across title/tags/body fields.
      haystacks.forEach((text, id) => { if (tokens.every((token) => text.includes(token))) candidates.add(id); });
      const score = (id) => (scores.get(id) || 0) + tokens.reduce((total, token) => total
        + (docs[id].title.includes(token) ? 10 : 0) + (docs[id].tags.includes(token) ? 4 : 0)
        + (docs[id].categories.includes(token) ? 2 : 0), 0);
      return Array.from(candidates).filter((id) => tokens.every((token) => haystacks[id].includes(token)))
        .sort((a, b) => score(b) - score(a) || a - b).slice(0, limit).map((id) => records[id]);
    } };
    return engine;
  }

  // Promise.race bounds fetch AND response.json, even if an adapter ignores abort.
  // Epoch checks ensure a closed/reopened dialog cannot receive a stale response.
  function createLoader(options) {
    const fetchIndex = options.fetch;
    const Controller = options.AbortController || (typeof AbortController === 'function' ? AbortController : null);
    const schedule = options.setTimeout || setTimeout;
    const cancelTimer = options.clearTimeout || clearTimeout;
    const timeoutMs = options.timeoutMs == null ? 8000 : options.timeoutMs;
    let state = 'idle';
    let index = null;
    let pending = null;
    let epoch = 0;
    let active = false;
    let retryCache = false;
    const snapshot = () => ({ state, index });
    const notify = () => { if (active && options.onChange) options.onChange(snapshot()); };
    const load = (force) => {
      if (pending) return pending.promise;
      if (index && !force) { state = 'ready'; notify(); return Promise.resolve(index); }
      const turn = ++epoch;
      const controller = Controller ? new Controller() : null;
      let timer;
      let cancel;
      const guard = new Promise((_, reject) => {
        cancel = () => reject(new Error('Search cancelled'));
        timer = schedule(() => {
          reject(new Error('Search timed out'));
          if (controller) controller.abort();
        }, timeoutMs);
      });
      const request = { controller, timer, cancel, promise: null };
      pending = request;
      state = 'loading';
      notify();
      const work = Promise.resolve().then(() => {
        if (turn !== epoch) throw new Error('Search cancelled');
        if (typeof fetchIndex !== 'function') throw new Error('Search unavailable');
        const init = { cache: force || retryCache ? 'reload' : 'default' };
        if (controller) init.signal = controller.signal;
        return fetchIndex('/search.json', init);
      }).then((response) => {
        if (!response || !response.ok) throw new Error('Search request failed');
        return response.json();
      }).then((data) => createIndex(data, options.MiniSearch));
      request.promise = Promise.race([work, guard]).then((value) => {
        if (turn !== epoch || !active) return null;
        index = value;
        state = 'ready';
        retryCache = false;
        notify();
        return value;
      }, () => {
        if (turn !== epoch || !active) return null;
        state = 'error';
        retryCache = true;
        notify();
        return null;
      }).finally(() => {
        cancelTimer(timer);
        if (pending === request) pending = null;
      });
      return request.promise;
    };
    return {
      getSnapshot: snapshot,
      open() { active = true; return load(false); },
      retry() { if (!active) return Promise.resolve(null); return load(true); },
      close() {
        active = false;
        epoch += 1;
        if (pending) {
          if (pending.controller) pending.controller.abort();
          cancelTimer(pending.timer);
          pending.cancel();
          pending = null;
        }
        state = index ? 'ready' : 'idle';
      }
    };
  }

  function renderResults(document, results, records) {
    results.textContent = '';
    records.forEach((record) => {
      // Defense in depth for callers besides the validated loader.
      if (!safePostUrl(record.url)) return;
      const link = document.createElement('a');
      link.className = 'search-result';
      link.href = record.url;
      const date = document.createElement('span');
      date.textContent = record.date;
      const title = document.createElement('strong');
      title.textContent = record.title;
      const excerpt = document.createElement('p');
      excerpt.textContent = record.content.slice(0, 120) + (record.content.length > 120 ? '…' : '');
      link.appendChild(date);
      link.appendChild(title);
      link.appendChild(excerpt);
      results.appendChild(link);
    });
  }

  function mount(document, window) {
    const dialog = document.querySelector('[data-search-dialog]');
    const input = document.querySelector('[data-search-input]');
    const results = document.querySelector('[data-search-results]');
    const meta = document.querySelector('[data-search-meta]');
    const retry = document.querySelector('[data-search-retry]');
    if (!dialog || !input || !results || !meta) return null;
    let lastFocus = null;
    let loader;
    const render = () => {
      if (dialog.hidden) return;
      const { state, index } = loader.getSnapshot();
      if (retry) retry.hidden = state !== 'error';
      results.setAttribute('aria-busy', String(state === 'loading'));
      renderResults(document, results, []);
      if (state === 'loading') { meta.textContent = '正在加载搜索索引…'; return; }
      if (state === 'error') { meta.textContent = '搜索索引加载失败，请点击重试'; return; }
      if (!index) { meta.textContent = '输入关键词开始检索'; return; }
      const tokens = queryTokens(input.value);
      const matches = tokens.length ? index.search(input.value) : [];
      const fallback = index.mode === 'basic' ? '（基础搜索模式）' : '';
      meta.textContent = (tokens.length ? matches.length ? `找到 ${matches.length} 条结果`
        : '没有匹配结果，试试 Docker、SSH、备份或 404' : `可检索 ${index.records.length} 篇文章`) + fallback;
      renderResults(document, results, matches);
    };
    loader = createLoader({ fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
      AbortController: window.AbortController, MiniSearch: window.MiniSearch, onChange: render });
    const close = () => {
      if (dialog.hidden) return;
      dialog.hidden = true;
      document.body.classList.remove('dialog-open');
      loader.close();
      if (lastFocus && typeof lastFocus.focus === 'function' && lastFocus.isConnected !== false) lastFocus.focus();
    };
    const open = () => {
      if (dialog.hidden) lastFocus = document.activeElement;
      dialog.hidden = false;
      document.body.classList.add('dialog-open');
      input.focus();
      const promise = loader.open();
      render();
      return promise;
    };
    document.querySelectorAll('[data-search-open]').forEach((button) => button.addEventListener('click', open));
    document.querySelectorAll('[data-search-close]').forEach((button) => button.addEventListener('click', close));
    if (retry) retry.addEventListener('click', () => loader.retry());
    input.addEventListener('input', render);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
    document.addEventListener('keydown', (event) => {
      if (dialog.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('button, input, a[href], [tabindex="0"]'))
        .filter((element) => !element.disabled && !element.hidden);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    });
    return { open, close, render, loader };
  }

  return { normalize, queryTokens, makeTokenizer, safePostUrl, validateRecords, createIndex, createLoader, renderResults, mount };
});
