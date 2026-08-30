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
})();
