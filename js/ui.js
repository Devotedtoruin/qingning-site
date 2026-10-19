/* 青柠小站 · 非模态面板的共享收起行为
   面板状态由调用方管理；原生 summary/button 的 Enter、Space 不在这里模拟。
   每份 document 只有一组外部指针/Escape 监听，模态搜索与灯箱优先。 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JournalUI = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const documents = new WeakMap();

  function modalOpen(document, window) {
    if (window && window.pswp) return true;
    const search = document.querySelector('[data-search-dialog]');
    if (search && !search.hidden) return true;
    const modals = document.querySelectorAll('[aria-modal="true"], dialog[open], .pswp--open');
    return Array.from(modals).some((modal) => {
      for (let node = modal; node && node !== document; node = node.parentElement || node.parentNode) {
        if (node.hidden || (node.getAttribute && node.getAttribute('aria-hidden') === 'true')) return false;
      }
      return true;
    });
  }

  function focusTarget(target, document) {
    for (let node = target; node && node !== document; node = node.parentElement || node.parentNode) {
      if (!node.getAttribute) continue;
      const name = (node.tagName || '').toLowerCase();
      if (name === 'label' || name === 'summary' || node.isContentEditable || node.getAttribute('contenteditable') === 'true') return true;
      if (!node.disabled && (node.tabIndex >= 0 || /^(?:input|button|select|textarea)$/.test(name) || (name === 'a' && node.getAttribute('href') !== null))) return true;
    }
    return false;
  }

  function createDocumentState(document, window) {
    const records = new Map();
    const stack = [];
    const removeFromStack = (record) => {
      const index = stack.indexOf(record);
      if (index !== -1) stack.splice(index, 1);
    };
    const sync = (record) => {
      const open = !!record.options.isOpen();
      if (open && !record.open) stack.push(record);
      else if (!open && record.open) removeFromStack(record);
      record.open = open;
    };
    const syncAll = () => records.forEach(sync);
    const close = (record, restoreFocus, reason) => {
      const { root, trigger, setOpen } = record.options;
      const hadFocus = root.contains(document.activeElement);
      setOpen(false, { reason });
      sync(record);
      if (restoreFocus && hadFocus && trigger.isConnected !== false && typeof trigger.focus === 'function') trigger.focus();
    };
    const pointerdown = (event) => {
      if (event.defaultPrevented || modalOpen(document, window)) return;
      syncAll();
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      stack.slice().reverse().forEach((record) => {
        const { root, panel, trigger } = record.options;
        if (root.contains(event.target) || path.includes(root)) return;
        const active = document.activeElement;
        const strandedFocus = panel.contains(active) && !focusTarget(event.target, document);
        close(record, false, 'outside');
        // Native outside controls own focus. Only a blank click that leaves focus
        // inside the now-hidden panel gets a safe fallback after the pointer action.
        if (strandedFocus) Promise.resolve().then(() => {
          if (records.get(root) === record && !record.options.isOpen() && document.activeElement === active && panel.contains(active) &&
              trigger.isConnected !== false && !modalOpen(document, window)) trigger.focus();
        });
      });
    };
    const keydown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || modalOpen(document, window)) return;
      syncAll();
      const record = stack[stack.length - 1];
      if (!record) return;
      event.preventDefault();
      close(record, true, 'escape');
    };
    document.addEventListener('pointerdown', pointerdown);
    document.addEventListener('keydown', keydown);
    return {
      records, sync,
      activate(record) {
        if (modalOpen(document, window)) return;
        records.forEach((other) => {
          if (other !== record && other.options.isOpen()) close(other, false, 'exclusive');
        });
      },
      release(record) { removeFromStack(record); records.delete(record.options.root); },
      destroy() {
        document.removeEventListener('pointerdown', pointerdown);
        document.removeEventListener('keydown', keydown);
        documents.delete(document);
      }
    };
  }

  function register(document, window, options) {
    if (!document || !window || !options || !options.root || !options.trigger || !options.panel ||
        typeof options.isOpen !== 'function' || typeof options.setOpen !== 'function') return () => {};
    let state = documents.get(document);
    if (!state) { state = createDocumentState(document, window); documents.set(document, state); }
    const existing = state.records.get(options.root);
    if (existing) return existing.unregister;
    const record = { options, open: false };
    const sync = () => state.sync(record);
    // details toggles after the click default action. The microtask observes that
    // native action; toggle/attributes also cover changes not initiated by a click.
    const afterClick = () => {
      const wasOpen = record.open;
      const observeClick = () => {
        if (state.records.get(options.root) !== record) return;
        sync();
        // Keyboard-activated native clicks follow the same exclusive opening path
        // as pointers. Programmatic opens still have a stack for Escape ordering.
        if (!wasOpen && record.open) state.activate(record);
      };
      observeClick();
      Promise.resolve().then(observeClick);
    };
    options.root.addEventListener('click', afterClick);
    options.root.addEventListener('toggle', sync);
    const observer = typeof window.MutationObserver === 'function' ? new window.MutationObserver(sync) : null;
    if (observer) observer.observe(options.root, { attributes: true, subtree: true, attributeFilter: ['open', 'hidden'] });
    let released = false;
    record.unregister = () => {
      if (released) return;
      released = true;
      options.root.removeEventListener('click', afterClick);
      options.root.removeEventListener('toggle', sync);
      if (observer) observer.disconnect();
      state.release(record);
      if (!state.records.size) state.destroy();
    };
    // Hover/focus opens have no click default action to observe. The owner may
    // refresh this one registration without installing another global listener.
    record.unregister.refresh = () => {
      if (released) return;
      sync();
      if (record.open) state.activate(record);
    };
    state.records.set(options.root, record);
    sync();
    return record.unregister;
  }

  return { register };
});
