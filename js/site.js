/* 青柠小站 · 页面脚本
   两类生命周期必须分开：
   - 全局一次：滚动进度、回到顶部、顶栏阴影、移动菜单、搜索快捷键提示。这些监听器
     挂在 document/window/header 上，PJAX 换 <main> 后依然有效。
   - 每页一次：导航当前页高亮、项目库筛选与空状态重置、目录、代码块复制、表格滚动、搜索挂载。
     这些作用于当前页面，PJAX 换页后必须重新执行；用元素级 WeakSet 去重，重复调用不会重复绑定。 */
(() => {
  'use strict';

  const prepared = new WeakSet();      // 已处理过的代码块
  const wrappedTables = new WeakSet(); // 已包过滚动容器的表格
  let globalsInstalled = false;
  let closeMenu = () => {};
  let updateMenuViewport = () => {};
  let scheduleGlobals = () => {};
  let pageCleanups = [];

  function destroyPage() {
    closeMenu();
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
    const musicDock = document.querySelector('body > .music-player');
    let lastScrollTop = window.scrollY || 0;
    let dockVisible = true;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (progress) progress.style.transform = 'scaleX(' + Math.min(1, Math.max(0, max > 0 ? doc.scrollTop / max : 0)) + ')';
      if (toTop) toTop.classList.toggle('is-visible', doc.scrollTop > 480);
      if (header) header.classList.toggle('is-scrolled', doc.scrollTop > 8);
      // 播放器胶囊：向下滚动时收起，向上滚动立刻回来；回到顶部附近始终显示。
      // 只切换类名，不暂停音频，也不销毁播放器实例。
      if (musicDock) {
        const top = doc.scrollTop;
        const goingDown = top > lastScrollTop + 6;
        const goingUp = top < lastScrollTop - 6;
        if (top < 160) dockVisible = true;
        else if (goingDown) dockVisible = false;
        else if (goingUp) dockVisible = true;
        lastScrollTop = top;
        musicDock.classList.toggle('is-dock-hidden', !dockVisible);
        musicDock.classList.toggle('is-compact', top < 120);
      }
      doc.style.setProperty('--floating-lift', '0px');
    };
    let ticking = false;
    scheduleGlobals = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { onScroll(); ticking = false; });
    };
    window.addEventListener('scroll', scheduleGlobals, { passive: true });
    window.addEventListener('resize', () => { updateMenuViewport(); scheduleGlobals(); });
    // 播放状态改变时立即刷新可见性，不必等下一次滚动。
    if (musicDock && typeof window.MutationObserver === 'function') {
      new window.MutationObserver(scheduleGlobals)
        .observe(musicDock, { attributes: true, attributeFilter: ['data-music-state'] });
    }
    onScroll();

    if (toTop) toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: prefersReduce() ? 'auto' : 'smooth' });
    });

    installMenu(document, window);
    enhanceHeaderSearchButton(document, window);
  }

  function enhanceHeaderSearchButton(document, window) {
    const searchButtons = Array.from(document.querySelectorAll('.header-actions [data-search-open]'));
    const isApple = /Mac|iPhone|iPad|iPod/i.test((window.navigator && window.navigator.platform) || '');
    const shortcutLabel = isApple ? '⌘K' : 'Ctrl K';
    searchButtons.forEach((btn) => {
      if (btn.querySelector('.search-kbd')) return;
      btn.classList.add('has-kbd');
      btn.setAttribute('title', '搜索文章 (' + shortcutLabel + ')');
      const kbd = document.createElement('kbd');
      kbd.className = 'search-kbd';
      kbd.setAttribute('aria-hidden', 'true');
      kbd.textContent = shortcutLabel;
      btn.appendChild(kbd);
    });
  }

  function syncActiveNav(document, window) {
    const rawPath = (window.location && window.location.pathname) ? window.location.pathname : '/';
    let pathname = rawPath;
    try { pathname = decodeURIComponent(rawPath); } catch (_) { /* keep rawPath */ }
    if (!pathname.endsWith('/')) pathname += '/';

    const links = Array.from(document.querySelectorAll('.desktop-nav a, .mobile-nav a'));
    links.forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('/')) return;
      const normalizedHref = href.endsWith('/') ? href : href + '/';
      let isCurrent = false;
      if (normalizedHref === '/') {
        isCurrent = pathname === '/';
      } else if (normalizedHref === '/articles/') {
        isCurrent = pathname.startsWith('/articles/') || pathname.startsWith('/page/') || pathname.startsWith('/posts/');
      } else {
        isCurrent = pathname.startsWith(normalizedHref);
      }
      link.classList.toggle('is-active', isCurrent);
      if (isCurrent) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function installMenu(document, window) {
    const menu = document.querySelector('[data-mobile-nav]');
    const buttons = Array.from(document.querySelectorAll('[data-menu-toggle]'));
    const header = document.querySelector('.site-header');
    if (!menu || !buttons.length || !header) return;
    const isWide = () => typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 861px)').matches;
    const isOpen = () => menu.classList.contains('is-open');
    const setOpen = (open) => {
      open = !!open && !isWide();
      menu.classList.toggle('is-open', open);
      menu.hidden = !open;
      buttons.forEach((button) => button.setAttribute('aria-expanded', String(open)));
    };
    closeMenu = () => setOpen(false);
    closeMenu();
    let registration;
    if (window.JournalUI && typeof window.JournalUI.register === 'function') {
      registration = window.JournalUI.register(document, window, {
        root: header, trigger: buttons[0], panel: menu, isOpen, setOpen
      });
    }
    buttons.forEach((button) => button.addEventListener('click', () => {
      setOpen(!isOpen());
      if (registration && typeof registration.refresh === 'function') registration.refresh();
    }));
    let lastWide = isWide();
    updateMenuViewport = () => {
      const nowWide = isWide();
      if (nowWide && !lastWide) {
        const active = document.activeElement;
        const hadFocus = menu.contains(active);
        closeMenu();
        if (hadFocus) {
          const equivalent = Array.from(header.querySelectorAll('.desktop-nav a'))
            .find((link) => link.getAttribute('href') === active.getAttribute('href'));
          const target = equivalent || header.querySelector('.brand');
          if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
        }
      }
      lastWide = nowWide;
    };
  }

  /* ---------- 每页：可重复调用 ---------- */
  function mountPage(document, window) {
    installGlobals(document, window);
    scheduleGlobals();
    closeMenu();
    syncActiveNav(document, window);

    // 搜索控制器跨页复用；此处是初次加载和 PJAX 重挂载的唯一入口。
    if (window.JournalSearch && typeof window.JournalSearch.mount === 'function') window.JournalSearch.mount(document, window);

    mountCodeBlocks(document);
    mountTables(document);
    mountToc(document, window);
    mountReveal(document, window);
    mountProjectFilters(document);
  }

  // 项目库：按分类和关键词过滤已渲染的卡片，不重新请求数据，支持一键重置筛选。
  function mountProjectFilters(document) {
    const root = document.querySelector('[data-project-grid]');
    if (!root || root.__projectFiltersMounted) return;
    root.__projectFiltersMounted = true;
    const cards = Array.from(root.querySelectorAll('[data-project-card]'));
    const buttons = Array.from(document.querySelectorAll('[data-project-filter]'));
    const search = document.querySelector('[data-project-search]');
    const status = document.querySelector('[data-project-status]');
    const empty = document.querySelector('[data-project-empty]');
    const lifetime = new AbortController();
    let group = 'all';

    // Ensure empty state has a reset button even if rendered from an older static template
    let resetBtn = empty ? empty.querySelector('[data-project-reset]') : null;
    if (empty && !resetBtn) {
      resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'secondary-action projects-empty-reset';
      resetBtn.setAttribute('data-project-reset', '');
      resetBtn.textContent = '清除筛选条件';
      empty.appendChild(resetBtn);
    }

    const apply = () => {
      const query = (search && search.value ? search.value : '').trim().toLowerCase();
      let visible = 0;
      cards.forEach((card) => {
        const groupMatch = group === 'all' || card.getAttribute('data-group') === group;
        const textMatch = !query || (card.getAttribute('data-search') || '').includes(query);
        const show = groupMatch && textMatch;
        card.hidden = !show;
        if (show) visible += 1;
      });
      buttons.forEach((button) => {
        button.setAttribute('aria-pressed', String((button.getAttribute('data-project-filter') || 'all') === group));
      });
      if (status) status.textContent = '显示 ' + visible + ' / ' + cards.length + ' 个项目';
      if (empty) empty.hidden = visible !== 0;
    };

    const reset = () => {
      group = 'all';
      if (search) search.value = '';
      apply();
      if (search && typeof search.focus === 'function') search.focus();
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        group = button.getAttribute('data-project-filter') || 'all';
        apply();
      }, { signal: lifetime.signal });
    });
    if (search) search.addEventListener('input', apply, { signal: lifetime.signal });
    if (resetBtn) resetBtn.addEventListener('click', reset, { signal: lifetime.signal });
    apply();
    pageCleanups.push(() => {
      lifetime.abort();
      delete root.__projectFiltersMounted;
    });
  }

  // 首页的进入与滚动显现。只做 opacity/transform，减少动态时完全跳过；
  // 脚本失败或浏览器不支持 IntersectionObserver 时内容保持可见。
  function mountReveal(document, window) {
    const main = document.querySelector('main');
    if (!main || prefersReduce() || typeof window.IntersectionObserver !== 'function') return;
    const targets = Array.from(main.querySelectorAll(
      '.home-intro, .lead-story, .recent-section .section-head, .recent-section .post-card, .post-grid-more, .topics-section'
    ));
    if (!targets.length) return;
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((element, index) => {
      element.style.setProperty('--reveal-delay', Math.min(index, 6) * 55 + 'ms');
      element.classList.add('reveal');
      observer.observe(element);
    });
    pageCleanups.push(() => observer.disconnect());
  }

  function mountCodeBlocks(document) {
    document.querySelectorAll('.article-content figure.highlight').forEach((figure) => {
      if (prepared.has(figure)) return;
      prepared.add(figure);
      const pre = figure.querySelector('pre');
      if (!pre) return;
      const cls = Array.from(figure.classList).find((c) => c !== 'highlight');
      // 高亮表格是横向滚动容器，给它一个键盘入口；没有它，键盘用户无法滚动长代码。
      const scroller = figure.querySelector('table');
      if (scroller && !scroller.hasAttribute('tabindex')) {
        scroller.tabIndex = 0;
        scroller.setAttribute('aria-label', (cls ? cls + ' ' : '') + '代码，可横向滚动');
      }
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
    const layout = document.querySelector('.article-layout');
    const toc = document.querySelector('[data-article-toc]');
    if (toc && toc.__tocMounted) return; // 同一份 DOM 不被重复挂载
    if (layout) layout.classList.remove('has-toc');
    if (!toc) return;
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
      toc.hidden = true;
      if (layout) layout.classList.remove('has-toc');
      delete toc.__tocMounted;
    });

    const list = toc.querySelector('[data-toc-list]');
    const heads = Array.from(document.querySelectorAll('.article-content h2, .article-content h3'))
      .filter((head) => head.textContent.trim() && !head.hidden && !head.closest('[hidden], [aria-hidden="true"]'));
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
    if (layout) layout.classList.add('has-toc');

    const button = toc.querySelector('[data-toc-toggle]');
    if (!list.id) list.id = 'article-toc-list';
    if (button) button.setAttribute('aria-controls', list.id);
    const isWide = () => window.matchMedia('(min-width: 1024px)').matches;
    const articleHeader = document.querySelector('.article-header');
    const aside = document.querySelector('.article-aside');
    const positionToc = () => {
      if (!articleHeader || !aside) return;
      if (isWide()) aside.insertBefore(toc, aside.firstChild);
      else articleHeader.parentNode.insertBefore(toc, articleHeader.nextSibling);
    };
    const setCollapsed = (collapsed) => {
      toc.classList.toggle('is-collapsed', collapsed);
      list.hidden = collapsed;
      if (button) button.setAttribute('aria-expanded', String(!collapsed));
    };
    const applyDefault = () => {
      const active = document.activeElement;
      const hadFocus = toc.contains(active);
      positionToc();
      setCollapsed(!isWide());
      if (hadFocus) {
        const target = list.hidden && list.contains(active) ? button : active;
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
      }
    };
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
      const y = target.getBoundingClientRect().top + window.scrollY - 88;
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
      const line = window.scrollY + 130;
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
