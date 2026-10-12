/* 青柠小站 · 页面脚本
   两类生命周期必须分开：
   - 全局一次：滚动进度、回到顶部、顶栏阴影、移动菜单、搜索挂载。这些监听器
     挂在 document/window/header 上，PJAX 换 <main> 后依然有效。
   - 每页一次：目录、进场动效、代码块复制、表格滚动。这些只作用于当前 <main>，
     PJAX 换页后必须重新执行；用元素级 WeakSet 去重，重复调用不会重复绑定。 */
(() => {
  'use strict';

  const prepared = new WeakSet();      // 已处理过的 .article-content
  const wrappedTables = new WeakSet(); // 已包过滚动容器的表格
  let globalsInstalled = false;
  let menuBound = false;
  let pageCleanups = [];

  function destroyPage() {
    const cleanups = pageCleanups;
    pageCleanups = [];
    cleanups.forEach((cleanup) => cleanup());
  }

  const prefersReduce = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 全局：装一次 ---------- */
  function installGlobals(document, window) {
    if (globalsInstalled) return;
    globalsInstalled = true;

    const progress = document.querySelector('[data-read-progress]');
    const toTop = document.querySelector('[data-to-top]');
    const header = document.querySelector('.site-header');
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (progress) progress.style.width = (max > 0 ? (doc.scrollTop / max) * 100 : 0) + '%';
      if (toTop) toTop.classList.toggle('is-visible', doc.scrollTop > 480);
      if (header) header.classList.toggle('is-scrolled', doc.scrollTop > 8);
    };
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { onScroll(); ticking = false; });
    }, { passive: true });
    onScroll();

    if (toTop) toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: prefersReduce() ? 'auto' : 'smooth' });
    });

    // 搜索弹窗：跨页共存，只挂一次。
    if (window.JournalSearch && typeof window.JournalSearch.mount === 'function') window.JournalSearch.mount(document, window);
  }

  /* ---------- 每页：可重复调用 ---------- */
  function mountPage(document, window) {
    installGlobals(document, window);
    if (!menuBound) {
      menuBound = true;
      document.querySelectorAll('[data-menu-toggle]').forEach((button) => button.addEventListener('click', () => {
        const menu = document.querySelector('[data-mobile-nav]');
        if (menu) menu.classList.toggle('is-open');
      }));
    }

    // 搜索索引/监听只在第一次安装；换页后仅重置输入与结果面板。
    if (window.JournalSearch && typeof window.JournalSearch.mount === 'function') window.JournalSearch.mount(document, window);

    mountReveal(document, window);
    mountCodeBlocks(document);
    mountTables(document);
    mountToc(document, window);
  }

  function mountReveal(document, window) {
    const targets = Array.from(document.querySelectorAll('.post-row, .taxonomy-grid li, .timeline-item, .subscribe-box, .article-toc'))
      .filter((el) => !prepared.has(el));
    if (!targets.length) return;
    if (prefersReduce() || !('IntersectionObserver' in window)) {
      targets.forEach((el) => { prepared.add(el); el.classList.add('reveal', 'is-in'); });
      return;
    }
    targets.forEach((el, i) => {
      prepared.add(el);
      el.classList.add('reveal');
      el.style.setProperty('--reveal-delay', Math.min(i, 5) * 55 + 'ms');
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach((el) => io.observe(el));
    pageCleanups.push(() => {
      io.disconnect();
      targets.forEach((el) => prepared.delete(el));
    });
  }

  function mountCodeBlocks(document) {
    document.querySelectorAll('.article-content figure.highlight').forEach((figure) => {
      if (prepared.has(figure)) return;
      prepared.add(figure);
      const pre = figure.querySelector('pre');
      if (!pre) return;
      const cls = Array.from(figure.classList).find((c) => c !== 'highlight');
      if (cls && !figure.querySelector('.code-lang')) {
        const tag = document.createElement('span');
        tag.className = 'code-lang';
        tag.setAttribute('aria-hidden', 'true');
        tag.textContent = cls;
        figure.appendChild(tag);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制代码');
      btn.addEventListener('click', async () => {
        const text = pre.innerText.replace(/\n+$/, '');
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
          } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          btn.textContent = '已复制';
          btn.classList.add('is-done');
        } catch (err) {
          btn.textContent = '复制失败';
        }
        setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('is-done'); }, 1600);
      });
      figure.appendChild(btn);
    });
  }

  function mountTables(document) {
    document.querySelectorAll('.article-content table').forEach((table) => {
      if (table.closest('figure.highlight') || table.closest('.table-scroll') || !table.parentNode) return;
      if (wrappedTables.has(table)) return;
      wrappedTables.add(table);
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      const caption = table.querySelector('caption');
      wrapper.setAttribute('aria-label', caption && caption.textContent.trim() ? caption.textContent.trim() : '文章表格，可横向滚动');
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  // Malformed percent escapes in a heading id must not stop the rest of the UI.
  function headingForLink(document, link) {
    const hash = link.getAttribute('href');
    if (!hash || !hash.startsWith('#')) return null;
    const raw = hash.slice(1);
    try { return document.getElementById(decodeURIComponent(raw)) || document.getElementById(raw); }
    catch (_) { return document.getElementById(raw); }
  }

  function mountToc(document, window) {
    const toc = document.querySelector('[data-article-toc]');
    if (!toc) return;
    if (toc.__tocMounted) return; // 同一份 DOM 不被重复挂载
    toc.__tocMounted = true;
    const disposers = [];
    let pageActive = true;
    const listen = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      disposers.push(() => target.removeEventListener(type, listener, options));
    };
    pageCleanups.push(() => {
      pageActive = false;
      disposers.forEach((dispose) => dispose());
      delete toc.__tocMounted;
    });

    const list = toc.querySelector('[data-toc-list]');
    const heads = Array.from(document.querySelectorAll('.article-content h2, .article-content h3'));
    let n = 0;
    let parent = null;
    let sublist = null;
    if (list) {
      list.textContent = '';
      heads.forEach((h) => {
        if (!h.id) {
          do { n += 1; } while (document.getElementById('section-' + n));
          h.id = 'section-' + n;
        }
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + encodeURIComponent(h.id);
        a.textContent = h.textContent.trim();
        li.appendChild(a);
        if (h.tagName === 'H3') {
          li.className = 'toc-l3';
          if (parent) {
            if (!sublist) { sublist = document.createElement('ol'); parent.appendChild(sublist); }
            sublist.appendChild(li);
          } else list.appendChild(li); // An initial h3 has no fabricated parent.
        } else {
          list.appendChild(li);
          parent = li;
          sublist = null;
        }
      });
    }
    if (!list || heads.length < 2) { toc.hidden = true; return; }
    toc.hidden = false;

    const button = toc.querySelector('[data-toc-toggle]');
    if (!list.id) list.id = 'article-toc-list';
    if (button) button.setAttribute('aria-controls', list.id);
    const isWide = () => window.matchMedia('(min-width: 900px)').matches;
    const setCollapsed = (collapsed) => {
      toc.classList.toggle('is-collapsed', collapsed);
      list.hidden = collapsed;
      if (button) button.setAttribute('aria-expanded', String(!collapsed));
    };
    const applyDefault = () => setCollapsed(!isWide());
    if (button) listen(button, 'click', () => setCollapsed(!list.hidden));
    applyDefault();
    let lastWide = isWide();
    listen(window, 'resize', () => {
      const nowWide = isWide();
      if (nowWide !== lastWide) { lastWide = nowWide; applyDefault(); }
    });
    listen(toc, 'click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const target = headingForLink(document, a);
      if (!target) return;
      e.preventDefault();
      const y = target.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: y, behavior: prefersReduce() ? 'auto' : 'smooth' });
      const state = window.history.state;
      const url = new URL(a.getAttribute('href'), window.location.href).href;
      const nextState = state && typeof state === 'object' ? { ...state } : state;
      if (nextState && nextState.__journalPjax) nextState.__journalPjax = { ...nextState.__journalPjax, url };
      window.history.replaceState(nextState, '', a.getAttribute('href'));
    });

    /* ---------- 目录跟随高亮（按滚动位置选，末项也能命中） ---------- */
    const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
    const pairs = links.map((a) => ({ link: a, head: headingForLink(document, a) })).filter((p) => p.head);
    if (!pairs.length) return;
    let currentId = null;
    const setActive = (id) => {
      if (id === currentId) return;
      currentId = id;
      pairs.forEach((p) => p.link.classList.toggle('is-active', p.head.id === id));
    };
    const update = () => {
      if (!pageActive) return; // Ignore a TOC frame queued before the page was removed.
      const line = window.scrollY + 120;
      let active = pairs[0].head.id;
      for (const p of pairs) {
        if (p.head.getBoundingClientRect().top + window.scrollY <= line) active = p.head.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        active = pairs[pairs.length - 1].head.id;
      }
      setActive(active);
    };
    let ticking2 = false;
    listen(window, 'scroll', () => {
      if (ticking2) return;
      ticking2 = true;
      requestAnimationFrame(() => { update(); ticking2 = false; });
    }, { passive: true });
    listen(window, 'resize', update);
    update();
  }

  window.JournalSite = { mountPage, destroyPage };

  const start = () => mountPage(document, window);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
