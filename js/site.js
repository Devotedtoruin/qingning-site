(() => {
  const dialog = document.querySelector('[data-search-dialog]');
  const input = document.querySelector('[data-search-input]');
  const results = document.querySelector('[data-search-results]');
  const meta = document.querySelector('[data-search-meta]');
  const menu = document.querySelector('[data-mobile-nav]');
  let index = null;
  let loading = null;

  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  const render = () => {
    const query = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!query) { meta.textContent = index ? `可检索 ${index.length} 篇文章` : '输入关键词开始检索'; return; }
    if (!index) { meta.textContent = '正在加载搜索索引...'; return; }
    const matches = index.filter((item) => [item.title, item.content, ...(item.tags || []), ...(item.categories || [])]
      .join(' ').toLowerCase().includes(query)).slice(0, 12);
    meta.textContent = matches.length ? `找到 ${matches.length} 条结果` : '没有匹配结果，试试 Docker、SSH、备份或 404';
    matches.forEach((item) => {
      const link = document.createElement('a');
      link.className = 'search-result';
      link.href = item.url;
      link.innerHTML = `<span>${escapeHtml(item.date)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content.slice(0, 120))}...</p>`;
      results.appendChild(link);
    });
  };

  const loadIndex = () => {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch('/search.json', { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then((data) => { index = data; render(); return data; })
        .catch(() => { meta.textContent = '搜索索引加载失败，请刷新后重试'; return []; });
    }
    return loading;
  };

  document.querySelectorAll('[data-menu-toggle]').forEach((button) => button.addEventListener('click', () => {
    menu.classList.toggle('is-open');
  }));

  const closeSearch = () => { dialog.hidden = true; document.body.classList.remove('dialog-open'); };
  const openSearch = () => {
    dialog.hidden = false;
    document.body.classList.add('dialog-open');
    input.focus();
    render();
    loadIndex();
  };

  document.querySelectorAll('[data-search-open]').forEach((button) => button.addEventListener('click', openSearch));
  document.querySelectorAll('[data-search-close]').forEach((button) => button.addEventListener('click', closeSearch));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeSearch(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !dialog.hidden) closeSearch(); });
  input.addEventListener('input', render);

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

  /* ---------- 从正文标题生成目录 ---------- */
  const toc = document.querySelector('[data-article-toc]');
  if (toc) {
    const list = toc.querySelector('[data-toc-list]');
    const heads = Array.from(document.querySelectorAll('.article-content h2, .article-content h3'));
    let n = 0;
    heads.forEach((h) => {
      if (!h.id) {
        n += 1;
        h.id = 'section-' + n;
      }
      const li = document.createElement('li');
      if (h.tagName === 'H3') li.className = 'toc-l3';
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      list.appendChild(li);
    });
    if (list.children.length >= 2) {
      toc.hidden = false;
      const head = toc.querySelector('p');
      const isWide = () => window.matchMedia('(min-width: 900px)').matches;
      // 统一成单一状态类：is-collapsed 表示“收起”。窄屏默认收起，宽屏默认展开。
      const applyDefault = () => {
        if (isWide()) toc.classList.remove('is-collapsed');
        else toc.classList.add('is-collapsed');
      };
      if (head) head.addEventListener('click', () => toc.classList.toggle('is-collapsed'));
      applyDefault();
      let lastWide = isWide();
      window.addEventListener('resize', () => {
        const nowWide = isWide();
        if (nowWide !== lastWide) { lastWide = nowWide; applyDefault(); }
      });
      toc.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
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
    const pairs = links.map((a) => ({
      link: a,
      head: document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)))
    })).filter((p) => p.head);

    if (pairs.length) {
      let currentId = null;
      const setActive = (id) => {
        if (id === currentId) return;
        currentId = id;
        pairs.forEach((p) => p.link.classList.toggle('is-active', p.head.id === id));
      };
      const update = () => {
        const line = window.scrollY + 120;          // 判定线：导航栏下方
        let active = pairs[0].head.id;
        for (const p of pairs) {
          if (p.head.getBoundingClientRect().top + window.scrollY <= line) active = p.head.id;
        }
        // 滚动到页面底部时，强制高亮最后一项
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
