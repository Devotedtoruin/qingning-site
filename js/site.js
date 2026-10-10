(() => {
  const menu = document.querySelector('[data-mobile-nav]');
  document.querySelectorAll('[data-menu-toggle]').forEach((button) => button.addEventListener('click', () => {
    if (menu) menu.classList.toggle('is-open');
  }));
  if (window.JournalSearch) window.JournalSearch.mount(document, window);

  /* ---------- 滚动进度条 ---------- */
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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ---------- 进场动效 ---------- */
  const revealTargets = document.querySelectorAll('.post-row, .taxonomy-grid li, .timeline-item, .subscribe-box, .article-toc');
  if (revealTargets.length) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      revealTargets.forEach((el) => el.classList.add('reveal', 'is-in'));
    } else {
      revealTargets.forEach((el, i) => {
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
      revealTargets.forEach((el) => io.observe(el));
    }
  }

  /* ---------- 代码块复制 ---------- */
  document.querySelectorAll('.article-content figure.highlight').forEach((figure) => {
    const pre = figure.querySelector('pre');
    if (!pre) return;
    const cls = Array.from(figure.classList).find((c) => c !== 'highlight');
    if (cls) {
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

  /* ---------- 普通表格局部横向滚动；不改变代码高亮表格 ---------- */
  document.querySelectorAll('.article-content table').forEach((table) => {
    if (table.closest('figure.highlight') || table.closest('.table-scroll') || !table.parentNode) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    const caption = table.querySelector('caption');
    wrapper.setAttribute('aria-label', caption && caption.textContent.trim() ? caption.textContent.trim() : '文章表格，可横向滚动');
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  // Malformed percent escapes in a heading id must not stop the rest of the UI.
  const headingForLink = (link) => {
    const hash = link.getAttribute('href');
    if (!hash || !hash.startsWith('#')) return null;
    const raw = hash.slice(1);
    try { return document.getElementById(decodeURIComponent(raw)) || document.getElementById(raw); }
    catch (_) { return document.getElementById(raw); }
  };

  /* ---------- 从正文标题生成有层级的目录 ---------- */
  const toc = document.querySelector('[data-article-toc]');
  if (toc) {
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
    if (list && heads.length >= 2) {
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
      if (button) button.addEventListener('click', () => setCollapsed(!list.hidden));
      applyDefault();
      let lastWide = isWide();
      window.addEventListener('resize', () => {
        const nowWide = isWide();
        if (nowWide !== lastWide) { lastWide = nowWide; applyDefault(); }
      });
      toc.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const target = headingForLink(a);
        if (!target) return;
        e.preventDefault();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const y = target.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
        history.replaceState(null, '', a.getAttribute('href'));
      });
    } else {
      toc.hidden = true;
    }
  }

  /* ---------- 目录跟随高亮（按滚动位置选，末项也能命中） ---------- */
  if (toc) {
    const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
    const pairs = links.map((a) => ({ link: a, head: headingForLink(a) })).filter((p) => p.head);
    if (pairs.length) {
      let currentId = null;
      const setActive = (id) => {
        if (id === currentId) return;
        currentId = id;
        pairs.forEach((p) => p.link.classList.toggle('is-active', p.head.id === id));
      };
      const update = () => {
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
      window.addEventListener('scroll', () => {
        if (ticking2) return;
        ticking2 = true;
        requestAnimationFrame(() => { update(); ticking2 = false; });
      }, { passive: true });
      window.addEventListener('resize', update);
      update();
    }
  }
})();
