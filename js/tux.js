'use strict';
// Tux, the companion who lives in the corner, gives hints and reacts to what you do.

// Tux, drawn flat (no gradients: the same ids would repeat everywhere this SVG is inserted).
// A faint light outline keeps his black body visible on dark wallpapers.
OS.tuxSvg = (cls = '') => `
<svg class="tux-svg ${cls}" viewBox="0 0 64 74" aria-hidden="true">
  <g fill="#1d1d23" stroke="rgba(255,255,255,0.28)" stroke-width="0.9">
    <path class="tux-wing-l" d="M17 35 C10 40 5.5 50 6.5 58 C7 61.5 10.5 61.5 12.5 58.5 C15 55 16.5 46 17 35Z"/>
    <path class="tux-wing-r" d="M47 35 C54 40 58.5 50 57.5 58 C57 61.5 53.5 61.5 51.5 58.5 C49 55 47.5 46 47 35Z"/>
    <path d="M32 3.5 C21.5 3.5 16.5 12 17 22 C17.3 28 14 33 11.8 40 C8.5 50 9.5 61.5 16.5 66.5 C22 70 42 70 47.5 66.5 C54.5 61.5 55.5 50 52.2 40 C50 33 46.7 28 47 22 C47.5 12 42.5 3.5 32 3.5Z"/>
  </g>
  <ellipse cx="25.5" cy="9.5" rx="5" ry="2.4" fill="#fff" opacity="0.13" transform="rotate(-24 25.5 9.5)"/>
  <path d="M32 29.5 C24 29.5 18.5 39.5 18.5 50.5 C18.5 61 24.5 67.5 32 67.5 C39.5 67.5 45.5 61 45.5 50.5 C45.5 39.5 40 29.5 32 29.5Z" fill="#f6f2e9"/>
  <ellipse cx="32" cy="61" rx="10.5" ry="5.5" fill="#d8d0bf" opacity="0.55"/>
  <g class="tux-eye">
    <ellipse cx="27" cy="18" rx="5" ry="6.6" fill="#f6f2e9"/>
    <g class="tux-pupil"><circle cx="28.2" cy="19" r="2.7" fill="#16161a"/><circle cx="29.1" cy="17.9" r="0.95" fill="#fff"/></g>
  </g>
  <g class="tux-eye">
    <ellipse cx="37" cy="18" rx="5" ry="6.6" fill="#f6f2e9"/>
    <g class="tux-pupil"><circle cx="35.8" cy="19" r="2.7" fill="#16161a"/><circle cx="36.7" cy="17.9" r="0.95" fill="#fff"/></g>
  </g>
  <path d="M26.5 26.8 Q32 32.2 37.5 26.8 Q32 28.8 26.5 26.8Z" fill="#dc8a0e"/>
  <path d="M24.8 25.2 Q32 21 39.2 25.2 Q35.5 28 32 28.1 Q28.5 28 24.8 25.2Z" fill="#fbb631"/>
  <g fill="#f5a524" stroke="#d58410" stroke-width="0.8" stroke-linejoin="round">
    <path d="M13.5 69.3 C13.5 65.6 18.5 64.3 23.2 65.3 C27.4 66.2 29.2 69.3 27.2 71 C24.2 72.9 15.2 72.7 13.5 69.3Z"/>
    <path d="M50.5 69.3 C50.5 65.6 45.5 64.3 40.8 65.3 C36.6 66.2 34.8 69.3 36.8 71 C39.8 72.9 48.8 72.7 50.5 69.3Z"/>
  </g>
</svg>`;

OS.tux = {
  node: null,
  bubble: null,
  hideTimer: null,

  init() {
    const { el } = OS.util;
    this.bubble = el('div', { class: 'tux-bubble', role: 'status', 'aria-live': 'polite' });
    const body = el('button', { class: 'tux-body', title: 'Click Tux for a hint', 'aria-label': 'Ask Tux for a hint', html: OS.tuxSvg() });
    const hide = el('button', { class: 'tux-hide', title: 'Hide Tux', 'aria-label': 'Hide Tux', text: '×' });
    this.node = el('div', { id: 'tux-companion' }, this.bubble, body, hide);
    document.getElementById('desktop').append(this.node);

    body.addEventListener('click', () => {
      if (this.node.classList.contains('hidden')) { this.node.classList.remove('hidden'); return; }
      this.say(OS.quests.hint(), 9000);
      this.hop();
    });
    hide.addEventListener('click', (e) => {
      e.stopPropagation();
      this.node.classList.add('hidden');
      this.bubble.classList.remove('show');
    });

    OS.bus.on('tux:say', (text) => this.say(text));
    OS.bus.on('achievement', () => this.hop());
    OS.bus.on('shell:noexec', () => this.say('That file is not executable yet. Give it permission with chmod +x <file>.'));
    OS.bus.on('pkg:denied', () => this.say('Installing software changes the whole system, so it needs sudo in front.'));
    OS.bus.on('shell:notfound', ({ name, suggestions }) => {
      if (!suggestions.length) this.say(`"${name}" isn't a command I know. Type help to see them all.`, 5000);
    });

    // Eyes follow the mouse a little.
    document.addEventListener('pointermove', (e) => {
      const r = body.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 300));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 3)) / 300));
      body.querySelectorAll('.tux-pupil').forEach((p) => { p.style.transform = `translate(${dx * 1.6}px, ${dy * 1.6}px)`; });
    });
  },

  say(text, ms) {
    if (!this.bubble || this.node.classList.contains('hidden')) return;
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.bubble.classList.remove('show'), ms || Math.min(14000, 3500 + text.length * 45));
  },

  hop() {
    const body = this.node?.querySelector('.tux-body');
    if (!body || OS.util.reducedMotion()) return;
    body.classList.remove('hop');
    void body.offsetWidth;
    body.classList.add('hop');
  },
};
