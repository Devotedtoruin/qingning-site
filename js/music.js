/* 青柠小站 · 唱片机播放器
   规则（与站点既有约定一致）：
   - 绝不自动播放：只有用户点击「播放」或点选曲目才调用 play()。
   - 不预加载音频：直到用户第一次展开播放器才注入 <source>。
   - 页面切换不断音乐：播放器是 <body> 的独立子元素，PJAX 只替换 <main>。
   - 不上报、不统计、不保存收听记录；localStorage 不参与。
   数据来源是播放器 <ol data-music-list> 中的静态条目，而不是远程配置。 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    const api = factory();
    root.JournalMusic = api;
    const start = () => api.mount(root.document, root);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // 与 media.js 同一套本地白名单：只接受站内 /audio/ 下的 mp3/ogg。
  function safeAudioUrl(value) {
    if (typeof value !== 'string' || value.includes('..') || /[\s\\?#%]/.test(value)) return false;
    return /^\/audio\/(?:[a-z0-9_-]+\/)*[a-z0-9_-][a-z0-9_.-]*\.(?:ogg|mp3)$/i.test(value);
  }

  const fmt = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  };

  // entries: [{ title, src }]，来自播放器静态列表，已通过 safeAudioUrl。
  function createPlayer(document, window, root) {
    const body = root.querySelector('[data-music-body]');
    const audio = root.querySelector('[data-music-audio]');
    const load = root.querySelector('[data-music-load]');
    const toggle = root.querySelector('[data-music-toggle]');
    const icon = root.querySelector('[data-music-toggle-icon]');
    const disc = root.querySelector('[data-vinyl-disc]');
    const titleEl = root.querySelector('[data-music-title]');
    const creditEl = root.querySelector('[data-music-credit-text]');
    const listEl = root.querySelector('[data-music-list]');
    const progress = root.querySelector('[data-music-progress]');
    const fill = root.querySelector('[data-music-progress-fill]');
    const currentEl = root.querySelector('[data-music-current]');
    const durationEl = root.querySelector('[data-music-duration]');
    const status = root.querySelector('[data-music-status]');
    if (!body || !audio || !load || !toggle || !listEl) return null;

    const entries = [];
    listEl.querySelectorAll('[data-track]').forEach((item) => {
      const src = item.getAttribute('data-src');
      const title = (item.textContent || '').trim();
      if (!safeAudioUrl(src) || !title) { item.hidden = true; return; }
      entries.push({ item, title, src });
    });
    // 列表为空时不留死控件：整个播放器保持折叠且按钮隐藏。
    if (!entries.length) { load.hidden = true; return null; }

    let index = 0;
    let loaded = false;
    let sourceEl = null;
    let seeking = false;
    let requestId = 0;
    let pendingPlay = false;
    let wantPlayback = false;
    let allowAutoNext = false;

    const fail = (message) => { status.textContent = message; };

    const paint = () => {
      const playing = !body.hidden && wantPlayback && !audio.paused;
      entries.forEach(({ item, title }, i) => {
        const isCurrent = i === index;
        item.classList.toggle('is-current', isCurrent);
        item.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        const button = item.querySelector('[data-track-play]');
        if (button) button.setAttribute('aria-label', (isCurrent && playing ? '正在播放：' : '播放：') + title);
      });
      const entry = entries[index];
      if (titleEl) titleEl.textContent = entry.title;
      if (creditEl) creditEl.textContent = entry.item.getAttribute('data-credit') || 'Kevin MacLeod · CC BY 3.0';
      if (icon) icon.textContent = playing ? '❚❚' : '▶';
      toggle.setAttribute('aria-label', playing ? '暂停' : '播放');
      if (disc) disc.classList.toggle('is-spinning', playing);
      root.setAttribute('data-music-state', playing ? 'playing' : (loaded ? 'paused' : 'idle'));
    };

    const setSource = (i) => {
      index = i;
      const entry = entries[i];
      if (!sourceEl) {
        sourceEl = document.createElement('source');
        audio.appendChild(sourceEl);
      }
      sourceEl.setAttribute('type', entry.src.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
      sourceEl.setAttribute('src', entry.src);
      if (fill) fill.style.width = '0%';
      if (progress) progress.setAttribute('aria-valuenow', '0');
      if (currentEl) currentEl.textContent = '0:00';
      try { audio.load(); } catch (_) { fail('音频暂时无法加载或当前浏览器不支持此格式。'); return false; }
      loaded = true;
      return true;
    };

    // 唯一允许调用 play() 的入口：由真实用户交互触发。
    const playAt = (i) => {
      const currentRequest = ++requestId;
      pendingPlay = true;
      wantPlayback = true;
      allowAutoNext = false;
      if ((!loaded || i !== index) && !setSource(i)) {
        pendingPlay = false;
        wantPlayback = false;
        paint();
        return;
      }
      let attempt;
      try { attempt = audio.play(); } catch (error) { attempt = Promise.reject(error); }
      if (attempt && typeof attempt.then === 'function') {
        attempt.then(() => {
          if (currentRequest !== requestId) return;
          pendingPlay = false;
          paint();
        }, () => {
          if (currentRequest !== requestId) return;
          pendingPlay = false;
          wantPlayback = false;
          allowAutoNext = false;
          fail('浏览器拦截了播放，请再点一次播放按钮。');
          paint();
        });
      } else pendingPlay = false;
    };

    const pause = () => {
      requestId += 1;
      pendingPlay = false;
      wantPlayback = false;
      allowAutoNext = false;
      audio.pause();
      paint();
    };

    const stop = () => {
      pause();
      try { audio.currentTime = 0; } catch (_) { /* metadata might not be available yet */ }
      if (fill) fill.style.width = '0%';
      if (progress) progress.setAttribute('aria-valuenow', '0');
      if (currentEl) currentEl.textContent = '0:00';
    };

    load.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      load.setAttribute('aria-expanded', String(open));
      if (open) {
        if (!loaded) setSource(index);
        paint();
        status.textContent = '选择曲目后点击播放，不会自动播放。';
      } else stop();
    });

    toggle.addEventListener('click', () => {
      if (pendingPlay || !audio.paused) pause();
      else playAt(index);
    });

    entries.forEach((entry, i) => {
      const button = entry.item.querySelector('[data-track-play]');
      const activate = () => {
        if (body.hidden) { body.hidden = false; load.setAttribute('aria-expanded', 'true'); }
        if (i === index && (pendingPlay || !audio.paused)) { pause(); return; }
        playAt(i);
      };
      if (button) button.addEventListener('click', activate);
      else entry.item.addEventListener('click', activate);
    });

    if (progress) {
      const seek = (event) => {
        if (!loaded || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const rect = progress.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        try { audio.currentTime = ratio * audio.duration; } catch (_) { /* keep playing from the old position */ }
      };
      const begin = (event) => {
        seeking = true;
        try { progress.setPointerCapture && progress.setPointerCapture(event.pointerId); } catch (_) {}
        seek(event);
      };
      const move = (event) => { if (seeking) seek(event); };
      const end = (event) => {
        if (!seeking) return;
        seeking = false;
        try { progress.releasePointerCapture && progress.releasePointerCapture(event.pointerId); } catch (_) {}
      };
      progress.addEventListener('pointerdown', begin);
      progress.addEventListener('pointermove', move);
      progress.addEventListener('pointerup', end);
      progress.addEventListener('pointercancel', end);
      // 键盘可达：左/右方向键平移 5 秒。
      progress.tabIndex = 0;
      progress.setAttribute('role', 'slider');
      progress.setAttribute('aria-label', '播放进度');
      progress.addEventListener('keydown', (event) => {
        if (!loaded || !Number.isFinite(audio.duration)) return;
        let delta = 0;
        if (event.key === 'ArrowRight') delta = 5;
        else if (event.key === 'ArrowLeft') delta = -5;
        else if (event.key === 'Home') { try { audio.currentTime = 0; } catch (_) {} event.preventDefault(); return; }
        else return;
        event.preventDefault();
        try { audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + delta)); } catch (_) {}
      });
    }

    const onTime = () => {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0 && fill) {
        fill.style.width = ((audio.currentTime / duration) * 100).toFixed(3) + '%';
        if (progress) progress.setAttribute('aria-valuenow', String(Math.round((audio.currentTime / duration) * 100)));
      }
      if (currentEl) currentEl.textContent = fmt(audio.currentTime);
      if (durationEl) durationEl.textContent = fmt(duration);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onTime);
    audio.addEventListener('durationchange', onTime);
    const onPlay = () => {
      if (body.hidden || !wantPlayback) { stop(); return; }
      allowAutoNext = true;
      paint();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlay);
    audio.addEventListener('pause', paint);
    audio.addEventListener('ended', () => {
      if (body.hidden || !allowAutoNext || !audio.ended) return;
      allowAutoNext = false;
      // 当前曲目自然播完后续播下一首，不在关闭、手动暂停或未播放状态续播。
      if (entries.length > 1) playAt((index + 1) % entries.length);
      else paint();
    });
    audio.addEventListener('error', () => { if (body.hidden) return; fail('音频暂时无法加载或当前浏览器不支持此格式，请稍后再试。'); paint(); });

    paint();
    return { playAt, paint, get index() { return index; }, entries };
  }

  const mounted = new WeakMap();

  function mount(document, window) {
    if (!document || !document.querySelector) return null;
    const created = [];
    document.querySelectorAll('[data-music-player]').forEach((root) => {
      if (mounted.has(root)) { created.push(mounted.get(root)); return; }
      const player = createPlayer(document, window, root);
      if (!player) return;
      mounted.set(root, player);
      created.push(player);
    });
    return { players: created };
  }

  return { mount, safeAudioUrl, formatTime: fmt };
});
