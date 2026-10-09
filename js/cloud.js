'use strict';
// Online accounts: a username and password, no email, no reset (see api/). The game still saves to
// localStorage first; when the player is logged in, each save is also pushed to the server a few
// seconds later. The login screen asks for the password every time and downloads the save with it.

OS.cloud = {
  // For local testing: localStorage.setItem('tuxos-api', 'http://localhost:8787') points the game at `npm run dev`.
  api: (() => { try { return localStorage.getItem('tuxos-api'); } catch { return null; } })() || 'https://api.tuxplore.akashanil.dev',
  TOKEN_KEY: 'tuxos-cloud-token',
  pushTimer: null,
  lastSync: null,

  get token() {
    try { return localStorage.getItem(this.TOKEN_KEY); } catch { return null; }
  },
  set token(value) {
    try { if (value) localStorage.setItem(this.TOKEN_KEY, value); else localStorage.removeItem(this.TOKEN_KEY); } catch { /* ignore */ }
  },
  get linked() { return !!this.token; },

  async request(method, path, body, { keepalive = false } = {}) {
    let res;
    try {
      res = await fetch(this.api + path, {
        method,
        keepalive,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("Couldn't reach the server. Check your internet connection and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `The server said no (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  // Creates the account and uploads the current progress as its first save.
  async signup(username, password, state) {
    const data = await this.request('POST', '/signup', { username, password, save: state });
    this.token = data.token;
    this.lastSync = data.updatedAt;
    return data;
  },

  // Returns the account's save; the caller decides what to do with the local one.
  // The password is asked for at every login, so the previous login's token is retired.
  async login(username, password) {
    const old = this.token;
    const data = await this.request('POST', '/login', { username, password });
    if (old && old !== data.token) fetch(`${this.api}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${old}` } }).catch(() => {});
    this.token = data.token;
    this.lastSync = data.updatedAt;
    return data;
  },

  async logout() {
    clearTimeout(this.pushTimer);
    try { await this.request('POST', '/logout'); } catch { /* the token is dropped either way */ }
    this.token = null;
  },

  // Called by OS.save(): push a few seconds after the last change, not on every keystroke.
  schedule() {
    if (!this.linked) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.push(), 5000);
  },

  async push({ keepalive = false } = {}) {
    if (!this.linked) return;
    clearTimeout(this.pushTimer);
    try {
      const data = await this.request('PUT', '/save', { save: OS.state }, { keepalive });
      this.lastSync = data.updatedAt;
      OS.bus.emit('cloud:sync');
    } catch (err) {
      if (err.status === 401) this.expired();
      // Otherwise (offline, server down) the next save tries again.
    }
  },

  expired() {
    this.token = null;
    OS.toast?.({ icon: '☁️', title: 'Logged out of your account', body: 'Log in again in Settings to keep syncing.' });
  },
};

// Last chance to save when the tab is closed or hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && OS.cloud.pushTimer) OS.cloud.push({ keepalive: true });
});
