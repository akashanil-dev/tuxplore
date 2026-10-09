'use strict';
// Anonymous usage counts, the friendly kind (see "What we collect" in the README, and stats.html):
//  - Page views go to GoatCounter (open source, no cookies). Its script is served from this site.
//  - Game events ("a quest was finished") go to our own API, which only adds 1 to that day's count.
// No cookies, no IDs, no usernames. Nothing is sent at all if the player turned it off in Settings
// or the browser asks not to be tracked (Do Not Track, Global Privacy Control).

OS.analytics = {
  goatcounter: 'https://tuxplore.goatcounter.com/count',
  // The opt-out belongs to this browser, not to a save, so switching or starting over keeps it.
  OPT_OUT_KEY: 'tuxos-no-analytics',

  get optedOut() {
    try { return localStorage.getItem(this.OPT_OUT_KEY) === '1'; } catch { return false; }
  },
  set optedOut(value) {
    try { if (value) localStorage.setItem(this.OPT_OUT_KEY, '1'); else localStorage.removeItem(this.OPT_OUT_KEY); } catch { /* ignore */ }
  },

  get allowed() {
    if (this.optedOut) return false;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return false;
    // Only the real site counts; a local copy counts only when pointed at a local API for testing.
    try { if (localStorage.getItem('tuxos-api')) return true; } catch { /* ignore */ }
    return location.hostname === 'tuxplore.akashanil.dev';
  },

  init() {
    if (!this.allowed) return;
    if (location.hostname === 'tuxplore.akashanil.dev') {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'js/vendor/goatcounter.js';
      script.dataset.goatcounter = this.goatcounter;
      document.head.append(script);
    }
  },

  // Plain text, not JSON, so the browser sends it without an extra CORS round trip.
  event(name) {
    if (!this.allowed) return;
    fetch(`${OS.cloud.api}/event`, { method: 'POST', body: JSON.stringify({ name }), keepalive: true }).catch(() => {});
  },
};
