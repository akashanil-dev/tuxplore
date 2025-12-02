'use strict';
// Tux, the companion who lives in the corner, gives hints and reacts to what you do.

OS.tuxSvg = (cls = '') => `
<svg class="tux-svg ${cls}" viewBox="0 0 64 74" aria-hidden="true">
  <ellipse cx="11" cy="46" rx="5" ry="14" fill="#1b1b1f" transform="rotate(18 11 46)" class="tux-wing-l"/>
  <ellipse cx="53" cy="46" rx="5" ry="14" fill="#1b1b1f" transform="rotate(-18 53 46)" class="tux-wing-r"/>
  <ellipse cx="32" cy="46" rx="21" ry="25" fill="#1b1b1f"/>
  <ellipse cx="32" cy="50" rx="14.5" ry="19" fill="#f4f1ea"/>
  <circle cx="32" cy="21" r="15.5" fill="#1b1b1f"/>
  <ellipse cx="26.5" cy="19" rx="4.6" ry="5.6" fill="#fff"/>
  <ellipse cx="37.5" cy="19" rx="4.6" ry="5.6" fill="#fff"/>
  <circle class="tux-pupil" cx="27.5" cy="20" r="2.3" fill="#111"/>
  <circle class="tux-pupil" cx="36.5" cy="20" r="2.3" fill="#111"/>
  <path d="M24.5 26.5 Q32 22.5 39.5 26.5 Q32 33.5 24.5 26.5Z" fill="#f5a524"/>
  <ellipse cx="22" cy="71" rx="9" ry="3.5" fill="#f5a524"/>
  <ellipse cx="42" cy="71" rx="9" ry="3.5" fill="#f5a524"/>
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
