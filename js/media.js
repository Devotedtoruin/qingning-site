/* Local, optional enhancements. Plain image links remain usable without JavaScript. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    const api = factory();
    root.JournalMedia = api;
    const start = () => api.mount(root.document, root);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Only canonical on-site asset paths: no remote URLs, redirects, query strings or SVGs.
  function safeAssetUrl(value, kind) {
    if (typeof value !== 'string' || value.includes('..') || /[\s\\?#%]/.test(value)) return false;
    const pattern = kind === 'audio'
      ? /^\/audio\/(?:[a-z0-9_-]+\/)*[a-z0-9_-][a-z0-9_.-]*\.(?:ogg|mp3)$/i
      : /^\/images\/(?:[a-z0-9_-]+\/)*[a-z0-9_-][a-z0-9_.-]*\.(?:avif|gif|jpe?g|png|webp)$/i;
    return pattern.test(value);
  }

  function dimensions(width, height) {
    const w = Number(width); const h = Number(height);
    return Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 65535 && h <= 65535
      ? { width: w, height: h } : null;
  }

  function imageCandidate(img) {
    if (img.closest('.logo, .brand, .footer-brand, figure.highlight, [data-no-lightbox]') ||
        img.getAttribute('role') === 'presentation' || img.getAttribute('alt') === '') return null;
    const thumbnail = img.getAttribute('src');
    if (!safeAssetUrl(thumbnail, 'image') || /(?:^|\/)(?:logo|favicon)(?:[._-]|$)/i.test(thumbnail)) return null;
    const anchor = img.closest('a');
    const src = anchor ? anchor.getAttribute('href') : thumbnail;
    if (!safeAssetUrl(src, 'image')) return null; // Never hijack links to pages or third-party sites.
    let size = anchor && dimensions(anchor.getAttribute('data-pswp-width'), anchor.getAttribute('data-pswp-height'));
    if (!size && src === thumbnail) {
      size = dimensions(img.naturalWidth, img.naturalHeight) || dimensions(img.getAttribute('width'), img.getAttribute('height'));
    }
    if (!size) return null; // Wait for the original thumbnail to load; never guess its aspect ratio.
    return { anchor, img, src, ...size };
  }

  function mountAnimations(article, window) {
    // GIF 不做暂停/播放控件：正常动效偏好下始终播放原动画。
    // 只有在系统显式要求减少动态时，才回退为静态 poster（不加载 GIF）。
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
    const cleanups = [];
    article.querySelectorAll('[data-animated-src]').forEach((img) => {
      const gif = img.getAttribute('data-animated-src');
      const poster = img.getAttribute('src');
      if (!safeAssetUrl(gif, 'image') || !/\.gif$/i.test(gif) || !safeAssetUrl(poster, 'image') || /\.gif$/i.test(poster)) return;
      const display = (animate) => {
        img.setAttribute('src', animate ? gif : poster); // Keep authored loading=lazy and width/height.
      };
      const applyPreference = () => display(!query.matches);
      applyPreference();
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', applyPreference);
        if (typeof query.removeEventListener === 'function') cleanups.push(() => query.removeEventListener('change', applyPreference));
      } else if (typeof query.addListener === 'function') {
        query.addListener(applyPreference);
        if (typeof query.removeListener === 'function') cleanups.push(() => query.removeListener(applyPreference));
      }
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }

  // Wrap bare content images in direct target=_blank links to the original file.
  // Clicking opens the image natively (save-as / open-in-new-tab); no overlay.
  function mountGallery(article, document, window) {
    const cleanups = [];
    article.querySelectorAll('img').forEach((img) => {
      const register = () => {
        const candidate = imageCandidate(img);
        if (!candidate || (candidate.anchor && candidate.anchor.classList.contains('article-media-link'))) return;
        let anchor = candidate.anchor;
        if (!anchor) {
          anchor = document.createElement('a');
          anchor.setAttribute('href', candidate.src);
          img.parentNode.insertBefore(anchor, img);
          anchor.appendChild(img);
        }
        anchor.classList.add('article-media-link');
        anchor.setAttribute('target', '_blank');
        const rel = new Set((anchor.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
        rel.add('noopener');
        anchor.setAttribute('rel', Array.from(rel).join(' '));
        if (!anchor.getAttribute('aria-label')) anchor.setAttribute('aria-label', '查看原图：' + (img.getAttribute('alt') || '文章图片'));
      };
      register();
      img.addEventListener('load', register);
      cleanups.push(() => img.removeEventListener('load', register));
    });
    return { enhanced: true, destroy: () => cleanups.forEach((cleanup) => cleanup()) };
  }

  // Release per-article media listeners when PJAX removes their <main>.
  const preparedArticles = new WeakMap();
  const activeArticles = new Set();

  function mount(document, window) {
    if (!document || !document.querySelectorAll) return null;
    document.__journalMediaMounted = true;
    activeArticles.forEach((article) => {
      if (article.isConnected) return;
      const prepared = preparedArticles.get(article);
      prepared.animations();
      prepared.gallery.destroy();
      activeArticles.delete(article);
      preparedArticles.delete(article);
    });
    const mounted = [];
    document.querySelectorAll('.article-content').forEach((article) => {
      const prepared = preparedArticles.get(article);
      if (prepared) return;
      const animations = mountAnimations(article, window);
      const gallery = mountGallery(article, document, window);
      preparedArticles.set(article, { animations, gallery });
      activeArticles.add(article);
      mounted.push(gallery);
    });
    return { galleries: mounted, mounted };
  }

  return { safeAssetUrl, dimensions, imageCandidate, mount };
});
