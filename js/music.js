/* 青柠小站 · 唱片机播放器
   规则（与站点既有约定一致）：
   - 首次播放必须由用户点击；自然结束后可续播下一首。
   - 不预加载音频：直到用户明确展开、选曲或播放才注入 <source>。
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
    const miniToggle = root.querySelector('[data-music-mini-toggle]');
    const miniIcon = root.querySelector('[data-music-mini-toggle-icon]');
    const miniTitle = root.querySelector('[data-music-mini-title]');
    const miniState = root.querySelector('[data-music-mini-state]');
    const closeButton = root.querySelector('[data-music-close]');
    const previous = root.querySelector('[data-music-previous]');
    const nextButtons = root.querySelectorAll('[data-music-next]');
    const volume = root.querySelector('[data-music-volume]');
    const icon = root.querySelector('[data-music-toggle-icon]');
    const discs = root.querySelectorAll('[data-vinyl-disc]');
    const titleEl = root.querySelector('[data-music-title]');
    const creditEl = root.querySelector('[data-music-credit-text]');
    const listEl = root.querySelector('[data-music-list]');
    const progress = root.querySelector('[data-music-progress]');
    const currentEl = root.querySelector('[data-music-current]');
    const durationEl = root.querySelector('[data-music-duration]');
    const status = root.querySelector('[data-music-status]');
    if (!body || !audio || !load || !toggle || !listEl) return null;

    const entries = [];
    listEl.querySelectorAll('[data-track]').forEach((item) => {
      const src = item.getAttribute('data-src');
      const titleNode = item.querySelector('.music-item-title');
      const title = ((titleNode ? titleNode.textContent : item.textContent) || '').trim();
      if (!safeAudioUrl(src) || !title) { item.hidden = true; return; }
      entries.push({ item, title, src });
    });
    // 列表为空时不留死控件：整个播放器保持折叠且按钮隐藏。
    if (!entries.length) { root.hidden = true; load.hidden = true; if (miniToggle) miniToggle.hidden = true; return null; }

    let index = 0;
    let loaded = false;
    let durationReady = false;
    let sourceEl = null;
    let seeking = false;
    let seekPointerId = null;
    let seekCancelled = false;
    let seekMessage = '';
    let requestId = 0;
    let pendingPlay = false;
    let wantPlayback = false;
    let allowAutoNext = false;
    let buffering = false;
    let errorMessage = '';

    const fail = (message) => { errorMessage = message; };
    const paintSymbol = (container, canPause) => {
      if (!container) return;
      container.querySelectorAll('[data-music-symbol]').forEach((node) => {
        node.hidden = node.getAttribute('data-music-symbol') !== (canPause ? 'pause' : 'play');
      });
    };

    const paint = () => {
      syncProgress();
      const playing = wantPlayback && !audio.paused && !audio.ended && !buffering && !errorMessage;
      const state = errorMessage ? 'error' : (wantPlayback && (pendingPlay || buffering) ? 'buffering' : (playing ? 'playing' : (loaded ? 'paused' : 'idle')));
      entries.forEach(({ item, title }, i) => {
        const isCurrent = i === index;
        item.classList.toggle('is-current', isCurrent);
        item.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        const button = item.querySelector('[data-track-play]');
        if (button) button.setAttribute('aria-label', (isCurrent && playing ? '正在播放：' : '播放：') + title);
      });
      const entry = entries[index];
      if (titleEl) titleEl.textContent = entry.title;
      if (miniTitle) miniTitle.textContent = entry.title;
      if (miniState) miniState.textContent = ({ idle: '未播放', paused: '已暂停', playing: '播放中', buffering: '缓冲中', error: '播放失败' })[state];
      if (creditEl) creditEl.textContent = entry.item.getAttribute('data-credit') || 'Kevin MacLeod · CC BY 3.0';
      const canPause = wantPlayback && (pendingPlay || (!audio.paused && !audio.ended));
      paintSymbol(icon, canPause);
      toggle.setAttribute('aria-label', canPause ? '暂停' : '播放');
      toggle.setAttribute('title', canPause ? '暂停' : '播放');
      paintSymbol(miniIcon, canPause);
      if (miniToggle) {
        const label = (canPause ? '暂停：' : '播放：') + entry.title;
        const stateLabel = ({ idle: '未播放', paused: '已暂停', playing: '播放中', buffering: '缓冲中', error: '播放失败' })[state];
        miniToggle.setAttribute('aria-label', label + '，' + stateLabel);
        miniToggle.setAttribute('title', entry.title + ' · ' + stateLabel + '（点击' + (canPause ? '暂停' : '播放') + '，长按移动）');
      }
      discs.forEach((disc) => disc.classList.toggle('is-spinning', playing));
      root.setAttribute('data-music-state', state);
      if (status) status.textContent = errorMessage || seekMessage || (state === 'buffering' ? '正在缓冲，请稍候。' : (playing ? '正在播放：' + entry.title : (loaded ? '已暂停，点击播放继续。' : '选择曲目后点击播放，不会自动播放。')));
    };

    const setSource = (i) => {
      cancelSeek();
      loaded = false;
      durationReady = false;
      index = i;
      errorMessage = '';
      seekMessage = '';
      buffering = false;
      const entry = entries[i];
      if (!sourceEl) {
        sourceEl = document.createElement('source');
        audio.appendChild(sourceEl);
      }
      sourceEl.setAttribute('type', entry.src.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
      sourceEl.setAttribute('src', entry.src);
      if (progress) {
        progress.disabled = true;
        progress.max = '0';
        progress.value = '0';
        progress.setAttribute('aria-valuetext', '尚未加载播放时长');
      }
      if (currentEl) currentEl.textContent = '0:00';
      if (durationEl) durationEl.textContent = '--:--';
      loaded = true;
      try { audio.load(); } catch (_) { loaded = false; fail('音频暂时无法加载或当前浏览器不支持此格式。'); syncProgress(); return false; }
      return true;
    };

    // 用户播放及已获允许的自然续播共用入口；暂停使旧请求失效。
    const playAt = (i) => {
      const currentRequest = ++requestId;
      pendingPlay = true;
      wantPlayback = true;
      allowAutoNext = false;
      errorMessage = '';
      // Native media errors persist until load() starts a fresh resource selection.
      if ((!loaded || i !== index || audio.error) && !setSource(i)) {
        pendingPlay = false;
        wantPlayback = false;
        paint();
        return;
      }
      if (audio.ended) { try { audio.currentTime = 0; } catch (_) {} }
      buffering = true;
      paint();
      let attempt;
      try { attempt = audio.play(); } catch (error) { attempt = Promise.reject(error); }
      if (attempt && typeof attempt.then === 'function') {
        attempt.then(() => {
          if (currentRequest !== requestId) return;
          pendingPlay = false;
          paint();
        }, (error) => {
          if (currentRequest !== requestId) return;
          pendingPlay = false;
          wantPlayback = false;
          allowAutoNext = false;
          buffering = false;
          fail(error && error.name === 'NotAllowedError' ? '浏览器拦截了播放，请再点一次播放按钮。' : '音频播放失败，请稍后再试。');
          paint();
        });
      } else pendingPlay = false;
    };

    const pause = () => {
      requestId += 1;
      pendingPlay = false;
      wantPlayback = false;
      allowAutoNext = false;
      buffering = false;
      audio.pause();
      paint();
    };

    // The panel is the only disclosure. Shared UI owns outside-click and Escape.
    const visibleFocusTarget = () => miniToggle || load;
    const focusVisible = () => { const target = visibleFocusTarget(); if (target && target.focus) target.focus(); };
    const setPanelOpen = (open) => {
      if (!open) cancelSeek();
      body.hidden = !open;
      root.setAttribute('data-music-open', String(open));
      load.setAttribute('aria-expanded', String(open));
      load.setAttribute('aria-label', open ? '收起音乐播放器' : '展开音乐播放器');
      load.setAttribute('title', open ? '收起音乐播放器' : '展开音乐播放器');
    };
    const setOpen = (open) => setPanelOpen(!!open);
    const unregister = window.JournalUI && typeof window.JournalUI.register === 'function'
      ? window.JournalUI.register(document, window, { root, trigger: load, panel: body, isOpen: () => !body.hidden, setOpen })
      : () => {};
    const refreshUI = () => { if (unregister.refresh) unregister.refresh(); };
    // Shared by the dock trigger and home adapter. Disclosure prepares a source
    // exactly once, refreshes shared dismissal/exclusivity, and never starts play.
    const open = () => {
      setPanelOpen(true);
      if (!loaded) setSource(index);
      refreshUI(); paint();
    };
    load.addEventListener('click', () => {
      if (body.hidden) open();
      else { setPanelOpen(false); refreshUI(); }
    });
    if (closeButton) closeButton.addEventListener('click', () => {
      const returnFocus = root.contains(document.activeElement);
      setPanelOpen(false); refreshUI();
      if (returnFocus) focusVisible();
    });

    const togglePlayback = () => {
      if (pendingPlay || (!audio.paused && !audio.ended)) pause();
      else playAt(index);
    };
    toggle.addEventListener('click', togglePlayback);
    if (miniToggle) miniToggle.addEventListener('click', togglePlayback);

    // Changing tracks preserves intent: a paused/idle player only selects a source.
    const step = (delta) => {
      const target = (index + delta + entries.length) % entries.length;
      if (wantPlayback && (pendingPlay || (!audio.paused && !audio.ended))) playAt(target);
      else {
        requestId += 1;
        pendingPlay = false; wantPlayback = false; allowAutoNext = false;
        setSource(target);
        paint();
      }
    };
    if (previous) previous.addEventListener('click', () => step(-1));
    nextButtons.forEach((button) => button.addEventListener('click', () => step(1)));

    const paintVolume = () => {
      if (volume && Number.isFinite(audio.volume) && audio.volume >= 0 && audio.volume <= 1) {
        volume.value = String(audio.volume);
        volume.setAttribute('aria-valuetext', Math.round(audio.volume * 100) + '%');
      }
    };
    if (volume) volume.addEventListener('input', () => {
      const value = volume.value;
      const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) { paintVolume(); return; }
      let unsupported = false;
      try { audio.volume = parsed; } catch (_) { unsupported = true; }
      if (!Number.isFinite(audio.volume) || Math.abs(audio.volume - parsed) > 0.01) unsupported = true;
      if (unsupported) {
        volume.disabled = true;
        volume.setAttribute('title', '当前浏览器不支持页面音量调节，请使用设备音量控制。');
      }
      paintVolume();
    });
    audio.addEventListener('volumechange', paintVolume);
    paintVolume();

    entries.forEach((entry, i) => {
      const button = entry.item.querySelector('[data-track-play]');
      const activate = () => {
        if (body.hidden) { setPanelOpen(true); refreshUI(); }
        if (i === index && (pendingPlay || (!audio.paused && !audio.ended))) { pause(); return; }
        playAt(i);
      };
      if (button) button.addEventListener('click', activate);
      else entry.item.addEventListener('click', activate);
    });

    // The browser owns the range's pointer/keyboard mechanics. Input previews;
    // change commits exactly once, including native keyboard changes.
    const canSeek = () => loaded && durationReady && !audio.error && !errorMessage && Number.isFinite(audio.duration) && audio.duration > 0;
    const syncProgress = () => {
      const valid = canSeek();
      const duration = valid ? audio.duration : 0;
      const actual = Number.isFinite(audio.currentTime) ? Math.max(0, Math.min(duration, audio.currentTime)) : 0;
      if (progress) {
        progress.disabled = !valid;
        progress.max = String(duration);
        if (!seeking || !valid) {
          progress.value = String(actual);
          progress.setAttribute('aria-valuetext', valid ? fmt(actual) + ' / ' + fmt(duration) : '尚未加载播放时长');
        }
      }
      if ((!seeking || !valid) && currentEl) currentEl.textContent = fmt(actual);
      if (durationEl) durationEl.textContent = valid ? fmt(duration) : '--:--';
    };
    const cancelSeek = () => {
      seeking = false;
      seekPointerId = null;
      seekCancelled = true;
      syncProgress();
    };
    if (progress) {
      progress.addEventListener('pointerdown', (event) => {
        if (!canSeek() || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
        seekPointerId = event.pointerId;
        seekCancelled = false;
      });
      progress.addEventListener('pointerup', (event) => {
        if (event.pointerId === seekPointerId) seekPointerId = null;
      });
      for (const name of ['pointercancel', 'lostpointercapture']) progress.addEventListener(name, (event) => {
        if (seekPointerId !== null && event.pointerId === seekPointerId) cancelSeek();
      });
      progress.addEventListener('input', () => {
        if (!canSeek()) { cancelSeek(); return; }
        const value = progress.value.trim() === '' ? NaN : Number(progress.value);
        if (!Number.isFinite(value)) { cancelSeek(); return; }
        seeking = true;
        seekCancelled = false;
        seekMessage = '';
        const preview = Math.max(0, Math.min(audio.duration, value));
        progress.setAttribute('aria-valuetext', fmt(preview) + ' / ' + fmt(audio.duration));
        if (currentEl) currentEl.textContent = fmt(preview);
      });
      progress.addEventListener('change', () => {
        if (seekCancelled || !canSeek()) { cancelSeek(); return; }
        const value = progress.value.trim() === '' ? NaN : Number(progress.value);
        seeking = false;
        seekPointerId = null;
        if (!Number.isFinite(value)) { cancelSeek(); return; }
        const target = Math.max(0, Math.min(audio.duration, value));
        let failed = false;
        try { audio.currentTime = target; } catch (_) { failed = true; }
        if (!Number.isFinite(audio.currentTime) || Math.abs(audio.currentTime - target) > 0.5) failed = true;
        seekMessage = failed ? '无法跳转，请稍后重试。' : '';
        syncProgress();
        paint();
      });
      progress.addEventListener('blur', cancelSeek);
    }
    const onTime = () => {
      durationReady = loaded && Number.isFinite(audio.duration) && audio.duration > 0;
      if (!canSeek()) cancelSeek(); else syncProgress();
    };
    for (const name of ['timeupdate', 'loadedmetadata', 'durationchange']) audio.addEventListener(name, onTime);
    for (const name of ['emptied', 'loadstart']) audio.addEventListener(name, () => { durationReady = false; cancelSeek(); });
    syncProgress();

    if (window.addEventListener) window.addEventListener('blur', cancelSeek);
    setPanelOpen(false);
    const guardPlay = () => {
      if (!wantPlayback) { pause(); return false; }
      return true;
    };
    audio.addEventListener('play', () => { if (guardPlay()) paint(); });
    audio.addEventListener('playing', () => {
      if (!guardPlay()) return;
      pendingPlay = false; buffering = false; errorMessage = ''; allowAutoNext = true;
      paint();
    });
    audio.addEventListener('waiting', () => { if (wantPlayback) { buffering = true; paint(); } });
    audio.addEventListener('stalled', () => { if (wantPlayback && audio.readyState < 3) { buffering = true; paint(); } });
    audio.addEventListener('pause', paint);
    audio.addEventListener('ended', () => {
      if (!allowAutoNext || !wantPlayback || !audio.ended) return;
      allowAutoNext = false;
      if (entries.length > 1) playAt((index + 1) % entries.length);
      else { wantPlayback = false; buffering = false; paint(); }
    });
    audio.addEventListener('error', () => {
      requestId += 1;
      pendingPlay = false; wantPlayback = false; allowAutoNext = false; buffering = false;
      fail('音频暂时无法加载或当前浏览器不支持此格式，请稍后再试。');
      seekMessage = '';
      cancelSeek();
      audio.pause();
      paint();
    });

    paint();
    return { playAt, step, togglePlayback, open, paint, unregister, setOpen, get index() { return index; }, entries };
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
