/* 青柠小站 · 页面脚本
   两类生命周期必须分开：
   - 全局一次：滚动进度、回到顶部、顶栏阴影、移动菜单、Mega Menu。这些监听器
     挂在 document/window/header 上，PJAX 换 <main> 后依然有效。
   - 每页一次：分类筛选与空状态、目录、代码块复制、表格滚动、搜索挂载。
     这些作用于当前页面，PJAX 换页后必须重新执行；用元素级 WeakSet 去重，重复调用不会重复绑定。 */
(() => {
  'use strict';

  const prepared = new WeakSet();      // 已处理过的代码块
  const wrappedTables = new WeakSet(); // 已包过滚动容器的表格
  let globalsInstalled = false;
  let closeMenu = () => {};
  let closeMega = () => {};
  let updateMenuViewport = () => {};
  let scheduleGlobals = () => {};
  let pageCleanups = [];

  function destroyPage() {
    closeMenu();
    closeMega();
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
    const footer = document.querySelector('.site-footer');
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
      // 浮动控件固定贴住视口右下角。页脚是视口内正常滚动的内容，
      // 不再把整段页脚高度算成“遮挡”，否则滚动到底时控件会被顶到屏幕中间。
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
    installMegaMenu(document, window);
  }

  function installMegaMenu(document, window) {
    const mega = document.querySelector('[data-mega-menu]');
    if (!mega) return;
    const trigger = mega.querySelector('summary');
    const panel = mega.querySelector('.mega-panel');
    if (!trigger || !panel) return;
    const setOpen = (open) => {
      mega.open = !!open;
      trigger.setAttribute('aria-expanded', String(!!open));
    };
    closeMega = () => setOpen(false);
    setOpen(mega.open);
    mega.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(mega.open)));
    panel.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('a')) setOpen(false);
    });
    if (window.JournalUI && typeof window.JournalUI.register === 'function') {
      window.JournalUI.register(document, window, {
        root: mega, trigger, panel, isOpen: () => mega.open, setOpen
      });
    }
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
    // The header owns both the trigger and panel without moving their layout DOM.
    // JournalUI alone owns outside/Escape, exclusive panels and return focus.
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
        // Never return focus to the now-hidden mobile trigger on desktop.
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
    closeMega();

    // 搜索控制器跨页复用；此处是初次加载和 PJAX 重挂载的唯一入口。
    if (window.JournalSearch && typeof window.JournalSearch.mount === 'function') window.JournalSearch.mount(document, window);

    mountCategoryTabs(document);
    mountLiveClock(document, window);
    mountMusicCard(document, window);
    mountBgSlider(document, window);
    mountTopSearch(document, window);
    mountHeroCarousel(document, window);
    mountThemeCard(document, window);
    mountCodeBlocks(document);
    mountTables(document);
    mountToc(document, window);
  }

  function mountCategoryTabs(document) {
    const tablist = document.querySelector('[data-category-tabs]');
    const feed = document.querySelector('[data-filterable-feed]');
    if (!tablist || !feed || tablist.__tabsMounted) return;
    tablist.__tabsMounted = true;
    const tabs = Array.from(tablist.querySelectorAll('[data-category-filter]'));
    const cards = Array.from(feed.querySelectorAll('[data-home-post]'));
    const emptyState = document.querySelector('[data-filter-empty]');
    const resetBtn = document.querySelector('[data-filter-reset]');
    const applyFilter = (category) => {
      tabs.forEach((tab) => {
        const active = tab.getAttribute('data-category-filter') === category;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      let visibleCount = 0;
      cards.forEach((card) => {
        const list = (card.getAttribute('data-post-categories') || '').split('|');
        const match = category === 'all' || list.includes(category);
        card.hidden = !match;
        card.classList.toggle('is-featured', match && visibleCount === 0);
        if (match) visibleCount += 1;
      });
      if (emptyState) emptyState.hidden = visibleCount > 0 || cards.length === 0;
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => applyFilter(tab.getAttribute('data-category-filter') || 'all'));
      tab.addEventListener('keydown', (event) => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[next].focus();
        applyFilter(tabs[next].getAttribute('data-category-filter') || 'all');
      });
    });
    if (resetBtn) resetBtn.addEventListener('click', () => {
      applyFilter('all');
      tabs[0].focus();
    });
    applyFilter('all');
    pageCleanups.push(() => { delete tablist.__tabsMounted; });
  }

  // 首页「此刻」面板：本地时间与日期。每页重挂，计时器随页面销毁。
  function mountLiveClock(document, window) {
    const clock = document.querySelector('[data-live-clock]');
    const dateEl = document.querySelector('[data-live-date]');
    const owner = clock || dateEl;
    if (!owner || owner.__liveClockMounted) return;
    owner.__liveClockMounted = true;
    const pad = (n) => String(n).padStart(2, '0');
    const paint = () => {
      const now = new Date();
      if (Number.isNaN(now.getTime())) return;
      const hh = pad(now.getHours()), mm = pad(now.getMinutes()), ss = pad(now.getSeconds());
      if (clock) clock.textContent = hh + ':' + mm + ':' + ss;
      if (dateEl) dateEl.textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · 周' + '日一二三四五六'[now.getDay()];
      const uptime = document.querySelector('[data-uptime]');
      if (uptime) {
        const start = new Date(2026, 7, 27).getTime();
        const days = Math.max(0, Math.floor((now.getTime() - start) / 86400000));
        uptime.textContent = days + ' 天';
      }
    };
    let timer = null;
    const sync = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      if (document.hidden) return;
      paint();
      timer = window.setInterval(paint, 1000);
    };
    document.addEventListener('visibilitychange', sync);
    sync();
    pageCleanups.push(() => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      delete owner.__liveClockMounted;
    });
  }

  // 首页播放器卡：把卡片按钮接到已有的 music 播放器实例上。
  function mountMusicCard(document, window) {
    const card = document.querySelector('.music-card');
    if (!card || card.__musicCardMounted) return;
    card.__musicCardMounted = true;
    let tries = 0;
    let retry = null;
    let observer = null;
    let alive = true;
    const disposers = [];
    const listen = (target, fn) => {
      if (!target) return;
      target.addEventListener('click', fn);
      disposers.push(() => target.removeEventListener('click', fn));
    };
    pageCleanups.push(() => {
      alive = false;
      if (retry !== null) window.clearTimeout(retry);
      if (observer) observer.disconnect();
      disposers.forEach(dispose => dispose());
      delete card.__musicCardBound;
      delete card.__musicCardMounted;
    });
    const bind = () => {
      if (!alive || card.__musicCardBound) return;
      const player = window.JournalMusic && window.JournalMusic.mount
        ? (window.JournalMusic.mount(document, window) || {}).players?.[0]
        : null;
      if (!player) {
        if (tries++ < 20) retry = window.setTimeout(bind, 120);
        return;
      }
      card.__musicCardBound = true;
      const playBtn = card.querySelector('[data-music-card-play]');
      const prevBtn = card.querySelector('[data-music-card-prev]');
      const nextBtn = card.querySelector('[data-music-card-next]');
      const expandBtn = card.querySelector('[data-music-card-expand]');
      const icon = card.querySelector('[data-music-card-icon]');
      const titleEl = card.querySelector('[data-music-card-title]');
      const stateEl = card.querySelector('[data-music-card-state]');
      const disc = card.querySelector('[data-music-card-disc]');

      const refresh = () => {
        const root = document.querySelector('[data-music-player]');
        const state = root ? root.getAttribute('data-music-state') : 'idle';
        const idx = player.index || 0;
        const entry = player.entries && player.entries[idx];
        if (entry && titleEl) titleEl.textContent = entry.title;
        const label = ({ idle: '未播放', paused: '已暂停', playing: '播放中', buffering: '缓冲中', error: '播放失败' })[state] || '未播放';
        if (stateEl) stateEl.textContent = label;
        if (icon) icon.textContent = state === 'playing' ? '❚❚' : '▶';
        if (disc) disc.classList.toggle('is-spinning', state === 'playing');
        if (playBtn) playBtn.setAttribute('aria-label', state === 'playing' ? '暂停' : '播放');
      };

      listen(playBtn, () => { player.togglePlayback(); refresh(); });
      listen(prevBtn, () => { player.step(-1); refresh(); });
      listen(nextBtn, () => { player.step(1); refresh(); });
      listen(expandBtn, () => {
        // 首页的胶囊默认淡出；展开动作同时把它切到可见，并让面板拿到焦点。
        player.open();
        const panel = document.querySelector('[data-music-body]');
        if (panel && !panel.hidden) {
          const closeBtn = panel.querySelector('[data-music-close]');
          if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus({ preventScroll: true });
        }
        refresh();
      });
      observer = new window.MutationObserver(refresh);
      const root = document.querySelector('[data-music-player]');
      if (root) observer.observe(root, { attributes: true, attributeFilter: ['data-music-state'] });
      refresh();
    };
    bind();
  }

  // 全站壁纸：只显示外观面板里选中的那一张，不自动轮换。
  function mountBgSlider(document, window) {
    const root = document.querySelector('[data-bg-slider]');
    if (!root) return;
    const slides = Array.from(root.querySelectorAll('[data-bg-slide]'));
    const config = window.JournalBackgrounds;
    if (!slides.length || !config || !config.choices) return;
    const enabled = config.choices.filter((c) => c.enabled);
    const paint = () => {
      const current = document.documentElement.getAttribute('data-background');
      const match = enabled.find((c) => c.id === current) || enabled[0];
      slides.forEach((slide, i) => {
        slide.style.backgroundImage = i === 0 && match ? 'url("' + match.src + '")' : 'none';
        slide.classList.toggle('is-active', i === 0 && !!match);
      });
    };
    paint();
    if (typeof window.MutationObserver !== 'function') return;
    const observer = new window.MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-background'] });
    pageCleanups.push(() => observer.disconnect());
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

  /* ---------- 顶部搜索：输入即检索，复用 search.js 的索引与 URL 校验 ---------- */
  function mountTopSearch(document, window) {
    const root = document.querySelector('[data-top-search]');
    const input = document.querySelector('[data-top-search-input]');
    const results = document.querySelector('[data-top-search-results]');
    const meta = document.querySelector('[data-top-search-meta]');
    if (!root || !input || !results || !meta || root.__topSearchMounted) return;
    root.__topSearchMounted = true;
    const api = window.JournalSearch;
    if (!api || typeof api.createIndex !== 'function' || typeof api.queryTokens !== 'function') {
      meta.textContent = '当前浏览器无法启用站内检索';
      return;
    }
    const DEFAULT_META = meta.textContent;
    const retry = root.querySelector('[data-top-search-retry]');
    let active = -1;
    let expanded = false;
    let alive = true;
    let composing = false;
    let loader;
    const disposers = [];
    const listen = (target, type, handler) => {
      target.addEventListener(type, handler);
      disposers.push(() => target.removeEventListener(type, handler));
    };

    const escapeToken = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const highlight = (text, tokens) => {
      const frag = document.createDocumentFragment();
      const source = String(text || '');
      const parts = tokens.length
        ? source.split(new RegExp('(' + tokens.map(escapeToken).join('|') + ')', 'gi'))
        : [source];
      parts.forEach((part, index) => {
        if (!part) return;
        if (tokens.length && index % 2 === 1) {
          const mark = document.createElement('mark');
          mark.textContent = part;
          frag.appendChild(mark);
        } else frag.appendChild(document.createTextNode(part));
      });
      return frag;
    };

    const clearResults = () => {
      results.hidden = true;
      results.textContent = '';
      active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    };
    const close = () => {
      expanded = false;
      loader.close();
      clearResults();
      if (retry) retry.hidden = true;
      root.removeAttribute('data-search-feedback');
      results.setAttribute('aria-busy', 'false');
      meta.textContent = DEFAULT_META;
    };
    const render = () => {
      if (!alive || !expanded) return;
      const query = input.value.trim();
      if (!query) { close(); return; }
      const { state, index } = loader.getSnapshot();
      clearResults();
      results.setAttribute('aria-busy', String(state === 'loading'));
      root.toggleAttribute('data-search-feedback', state === 'loading' || state === 'error');
      if (retry) retry.hidden = state !== 'error';
      if (state === 'loading') { meta.textContent = '正在加载检索索引…'; return; }
      if (state === 'error') { meta.textContent = '检索索引加载失败，请重试。'; return; }
      if (!index) return;
      const tokens = api.queryTokens(query);
      const records = index.search(query, 8);
      results.textContent = '';
      active = records.length ? 0 : -1;
      if (!records.length) {
        const empty = document.createElement('p');
        empty.className = 'top-search-empty';
        empty.textContent = '没有匹配结果，试试 Docker、SSH、Nginx 或备份。';
        results.appendChild(empty);
      }
      records.forEach((record, index) => {
        if (!api.safePostUrl(record.url)) return;
        const link = document.createElement('a');
        link.className = 'search-result';
        link.href = record.url;
        link.id = results.id + '-option-' + index;
        link.setAttribute('role', 'option');
        link.setAttribute('aria-selected', String(index === active));
        if (index === active) link.classList.add('is-active');
        const time = document.createElement('time');
        time.textContent = record.date;
        const title = document.createElement('strong');
        title.appendChild(highlight(record.title, tokens));
        const excerpt = document.createElement('p');
        excerpt.appendChild(highlight(record.content.slice(0, 110) + (record.content.length > 110 ? '…' : ''), tokens));
        link.appendChild(time);
        link.appendChild(title);
        link.appendChild(excerpt);
        results.appendChild(link);
      });
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      const selected = results.querySelector('.search-result.is-active');
      if (selected) input.setAttribute('aria-activedescendant', selected.id);
      meta.textContent = records.length ? '找到 ' + records.length + ' 条' : '没有匹配结果';
    };

    const move = (delta) => {
      const options = Array.from(results.querySelectorAll('.search-result'));
      if (!options.length) return;
      active = (active + delta + options.length) % options.length;
      options.forEach((option, index) => {
        option.classList.toggle('is-active', index === active);
        option.setAttribute('aria-selected', String(index === active));
      });
      const target = options[active];
      if (target) input.setAttribute('aria-activedescendant', target.id);
      if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
    };
    loader = api.createLoader({ fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
      AbortController: window.AbortController, MiniSearch: window.MiniSearch, onChange: render });
    const show = () => {
      if (composing) return;
      if (!input.value.trim()) { close(); return; }
      expanded = true;
      loader.open();
      render();
    };
    const form = root.querySelector('form');
    if (form) listen(form, 'submit', (event) => {
      event.preventDefault();
      if (composing) return;
      const options = results.querySelectorAll('.search-result');
      const selected = options[active];
      if (selected) selected.click();
    });
    listen(input, 'input', show);
    listen(input, 'focus', show);
    listen(input, 'compositionstart', () => { composing = true; });
    listen(input, 'compositionend', () => { composing = false; show(); });
    listen(input, 'keydown', (event) => {
      if (event.isComposing || composing || event.keyCode === 229) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        const selected = results.querySelectorAll('.search-result')[active];
        if (selected) selected.click();
      }
      else if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
    if (retry) listen(retry, 'click', () => { expanded = true; loader.retry(); });
    listen(document, 'pointerdown', (event) => { if (!root.contains(event.target)) close(); });
    pageCleanups.push(() => {
      alive = false;
      close();
      disposers.forEach(dispose => dispose());
      delete root.__topSearchMounted;
    });
  }

  /* ---------- 首页焦点卡轮播：5 秒切换，圆点可点，减少动态时静止 ---------- */
  function mountHeroCarousel(document, window) {
    const root = document.querySelector('[data-hero-carousel]');
    if (!root || root.__heroMounted) return;
    const card = root.querySelector('[data-hero-card]');
    const dots = Array.from(root.querySelectorAll('[data-hero-slide]'));
    if (!card || dots.length < 2) return;
    root.__heroMounted = true;
    const title = card.querySelector('[data-hero-title]');
    const excerpt = card.querySelector('[data-hero-excerpt]');
    let cover = card.querySelector('[data-hero-cover]');
    const slides = dots.map((dot) => ({
      href: dot.getAttribute('data-href') || '',
      title: dot.getAttribute('data-title') || '',
      excerpt: dot.getAttribute('data-excerpt') || '',
      cover: dot.getAttribute('data-cover') || ''
    }));
    // 只接受站内文章路由，模板以外的东西不会变成可点击目标。
    const usable = (slide) => /^\/posts\/[^\s?#<>"'\\]*\/$/.test(slide.href);
    let current = 0;
    const paint = (index) => {
      const slide = slides[index];
      if (!slide || !usable(slide)) return;
      current = index;
      card.setAttribute('href', slide.href);
      if (title) title.textContent = slide.title;
      if (excerpt) excerpt.textContent = slide.excerpt;
      if (!cover && slide.cover) {
        cover = document.createElement('img');
        cover.className = 'hero-card-bg';
        cover.alt = '';
        cover.setAttribute('aria-hidden', 'true');
        cover.setAttribute('data-hero-cover', '');
        card.insertBefore(cover, card.firstChild);
      }
      if (cover) {
        if (slide.cover) {
          cover.hidden = false;
          if (cover.getAttribute('src') !== slide.cover) cover.setAttribute('src', slide.cover);
        } else cover.hidden = true;
      }
      card.classList.toggle('is-diagram', /\.svg$/i.test(slide.cover));
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', String(i === index));
        dot.tabIndex = i === index ? 0 : -1;
      });
    };
    let timer = null;
    let hovered = false;
    let focused = false;
    const motion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const disposers = [];
    const listen = (target, type, fn) => {
      target.addEventListener(type, fn);
      disposers.push(() => target.removeEventListener(type, fn));
    };
    const stop = () => { if (timer !== null) window.clearInterval(timer); timer = null; };
    const sync = () => {
      stop();
      if (hovered || focused || document.hidden || (motion && motion.matches)) return;
      timer = window.setInterval(() => paint((current + 1) % slides.length), 5000);
    };
    dots.forEach((dot, index) => {
      dot.tabIndex = index === 0 ? 0 : -1;
      listen(dot, 'click', () => { paint(index); sync(); });
      listen(dot, 'keydown', (event) => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % dots.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + dots.length) % dots.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = dots.length - 1;
        else return;
        event.preventDefault();
        dots[next].focus();
        paint(next);
        sync();
      });
    });
    listen(root, 'pointerenter', () => { hovered = true; sync(); });
    listen(root, 'pointerleave', () => { hovered = false; sync(); });
    listen(root, 'focusin', () => { focused = true; sync(); });
    listen(root, 'focusout', (event) => { focused = root.contains(event.relatedTarget); sync(); });
    listen(document, 'visibilitychange', sync);
    if (motion && typeof motion.addEventListener === 'function') listen(motion, 'change', sync);
    sync();
    pageCleanups.push(() => { stop(); disposers.forEach(dispose => dispose()); delete root.__heroMounted; });
  }

  /* ---------- 首页日夜切换卡：复用外观面板的配色枚举，状态以 data-scheme 为准 ---------- */
  function mountThemeCard(document, window) {
    const card = document.querySelector('[data-theme-toggle]');
    if (!card || card.__themeMounted) return;
    card.__themeMounted = true;
    const label = card.querySelector('[data-theme-label]');
    const hint = card.querySelector('[data-theme-hint]');
    const glyph = card.querySelector('[data-theme-glyph]');
    const root = document.documentElement;
    const isDark = () => root.getAttribute('data-scheme') === 'dark';
    const paint = () => {
      const dark = isDark();
      card.setAttribute('aria-pressed', String(dark));
      if (label) label.textContent = dark ? '夜间模式' : '日间模式';
      if (hint) hint.textContent = dark ? '流萤飞舞的深空' : '落樱漫舞的清晨';
      if (glyph) glyph.textContent = dark ? '✨' : '🌸';
    };
    card.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      const target = document.querySelector('[data-appearance-choice="' + next + '"]');
      if (target && !target.disabled) target.click();
      paint();
    });
    const observer = typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(paint) : null;
    if (observer) observer.observe(root, { attributes: true, attributeFilter: ['data-scheme'] });
    paint();
    pageCleanups.push(() => { if (observer) observer.disconnect(); delete card.__themeMounted; });
  }

  window.JournalSite = { mountPage, destroyPage };

  const start = () => mountPage(document, window);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
