'use strict';

/* ============================================================
   Tempo — API client for the Express + MySQL backend
   ============================================================ */

const TempoAPI = (() => {
  const API_BASE = '/api';
  const SAVE_DELAY = 350;

  let mode = 'local';
  let pending = null;
  let timer = null;
  let flushing = false;
  let lastErrorAt = 0;

  function isDatabase() {
    return mode === 'database';
  }

  function setMode(nextMode) {
    mode = nextMode;
    try {
      localStorage.setItem('tempo.mode.v1', nextMode);
    } catch (error) {
      /* Local storage can be unavailable; the app still works for this session. */
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && payload.error
        ? payload.error
        : `The server returned ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function loadState() {
    const state = await request('/state');
    setMode('database');
    return state;
  }

  async function saveNow(state) {
    const response = await request('/state', {
      method: 'PUT',
      body: JSON.stringify(state)
    });
    setMode('database');
    return response;
  }

  function reportError(error) {
    if (typeof onError === 'function') {
      const now = Date.now();
      if (now - lastErrorAt > 8000) {
        lastErrorAt = now;
        onError(error);
      }
    }
  }

  let onError = null;

  async function flush() {
    if (flushing) return;
    if (!pending) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    flushing = true;
    try {
      while (pending) {
        const snapshot = pending;
        pending = null;
        try {
          await request('/state', {
            method: 'PUT',
            body: JSON.stringify(snapshot)
          });
        } catch (error) {
          reportError(error);
          break;
        }
      }
    } finally {
      flushing = false;
      if (pending && !timer) schedule();
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, SAVE_DELAY);
  }

  function queueSave(state) {
    if (!isDatabase() || !state) return;
    pending = state;
    schedule();
  }

  function flushForPageHide() {
    if (!isDatabase() || !pending) return;
    const snapshot = pending;
    pending = null;
    try {
      fetch(`${API_BASE}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        keepalive: true
      }).catch(() => {});
    } catch (error) {
      /* Page is closing; nothing else can be done. */
    }
  }

  window.addEventListener('pagehide', flushForPageHide);
  window.addEventListener('beforeunload', flushForPageHide);
  window.addEventListener('online', () => {
    if (isDatabase() && pending) flush();
  });

  return {
    loadState,
    saveNow,
    queueSave,
    flush,
    isDatabase,
    setMode,
    getMode: () => mode,
    setErrorHandler(handler) {
      onError = typeof handler === 'function' ? handler : null;
    },
    markLocal(error) {
      setMode('local');
      if (error && error.status !== 404) {
        console.warn('Tempo is using local browser storage:', error.message);
      }
    }
  };
})();
