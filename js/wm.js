'use strict';
// Window manager and desktop shell: top panel, desktop icons, dock, launcher, windows.

OS.apps = {};
OS.registerApp = (id, def) => { OS.apps[id] = { id, w: 720, h: 480, single: true, ...def }; };

OS.icons = {
  terminal: `<svg viewBox="0 0 48 48"><rect x="4" y="7" width="40" height="34" rx="7" fill="#1f2430"/><rect x="4" y="7" width="40" height="8" rx="4" fill="#2d3445"/><path d="M12 23l6 4-6 4" stroke="#4ade80" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 32h12" stroke="#e5e7eb" stroke-width="3" stroke-linecap="round"/></svg>`,
  files: `<svg viewBox="0 0 48 48"><path d="M5 13a4 4 0 0 1 4-4h10l4 4h16a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#3b82f6"/><path d="M5 19h38v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#60a5fa"/></svg>`,
  pipedream: `<svg viewBox="0 0 48 48"><rect x="4" y="8" width="40" height="32" rx="8" fill="#0e7490"/><rect x="9" y="19" width="9" height="10" rx="2.5" fill="#fde047"/><rect x="30" y="19" width="9" height="10" rx="2.5" fill="#f472b6"/><path d="M18 24h12" stroke="#e0f2fe" stroke-width="3.5"/><path d="M22 18v12" stroke="#e0f2fe" stroke-width="3.5" stroke-linecap="round"/></svg>`,
  runner: `<svg viewBox="0 0 48 48"><rect x="4" y="6" width="40" height="36" rx="8" fill="#f59e0b"/><circle cx="24" cy="18" r="7" fill="#1b1b1f"/><ellipse cx="24" cy="30" rx="9" ry="9" fill="#1b1b1f"/><ellipse cx="24" cy="31" rx="5.5" ry="6.5" fill="#fff"/><circle cx="21.5" cy="17" r="1.6" fill="#fff"/><circle cx="26.5" cy="17" r="1.6" fill="#fff"/><path d="M21 20.5h6l-3 2.5z" fill="#f5a524"/><path d="M8 40h32" stroke="#92400e" stroke-width="3"/></svg>`,
  journal: `<svg viewBox="0 0 48 48"><rect x="9" y="5" width="30" height="38" rx="4" fill="#a16207"/><rect x="12" y="5" width="27" height="38" rx="3" fill="#ca8a04"/><path d="M18 15h15M18 21h15M18 27h10" stroke="#fef3c7" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  settings: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="13" fill="none" stroke="#94a3b8" stroke-width="8" stroke-dasharray="5.1 5.1"/><circle cx="24" cy="24" r="11" fill="#64748b"/><circle cx="24" cy="24" r="5" fill="#e2e8f0"/></svg>`,
  achievements: `<svg viewBox="0 0 48 48"><path d="M14 8h20v10a10 10 0 0 1-20 0z" fill="#facc15"/><path d="M14 11H8a6 6 0 0 0 7 8M34 11h6a6 6 0 0 1-7 8" fill="none" stroke="#eab308" stroke-width="3"/><rect x="21" y="27" width="6" height="7" fill="#eab308"/><rect x="15" y="34" width="18" height="6" rx="2" fill="#a16207"/></svg>`,
  install: `<svg viewBox="0 0 48 48"><rect x="15" y="4" width="18" height="10" rx="2" fill="#94a3b8"/><rect x="18" y="7" width="4" height="4" fill="#334155"/><rect x="26" y="7" width="4" height="4" fill="#334155"/><rect x="11" y="13" width="26" height="31" rx="5" fill="#16a34a"/><circle cx="24" cy="28" r="7" fill="none" stroke="#dcfce7" stroke-width="2.5"/><path d="M24 21v7" stroke="#dcfce7" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  lock: '🔒',
};

OS.wm = {
  windows: [],
  z: 10,
  layer: null,

  init() {
    const { el } = OS.util;
    const desktop = document.getElementById('desktop');
    desktop.innerHTML = '';
    desktop.hidden = false;

    // Panel
    this.clock = el('span', { class: 'panel-clock' });
    this.questChip = el('button', { class: 'panel-chip', title: 'Quest journal', onclick: () => this.open('journal') });
    this.trophyChip = el('button', { class: 'panel-chip', title: 'Achievements', onclick: () => this.open('achievements') });
    const power = el('button', { class: 'panel-chip', title: 'Power', 'aria-label': 'Power menu', text: '⏻', onclick: (e) => this.powerMenu(e) });
    const panel = el('header', { id: 'panel' },
      el('button', { class: 'panel-activities', onclick: () => this.toggleLauncher() }, el('span', { class: 'panel-logo', html: OS.tuxSvg() }), el('span', { text: 'Activities' })),
      this.clock,
      el('div', { class: 'panel-right' }, this.questChip, this.trophyChip, power));

    this.iconsEl = el('div', { id: 'desktop-icons' });
    this.layer = el('div', { id: 'windows' });
    this.dock = el('nav', { id: 'dock', 'aria-label': 'Dock' });
    this.launcher = el('div', { id: 'launcher', hidden: true });
    desktop.append(panel, this.iconsEl, this.layer, this.dock, this.launcher, el('div', { id: 'toasts' }));

    this.renderIcons();
    this.renderDock();
    this.updateChips();
    this.tickClock();
    setInterval(() => this.tickClock(), 10000);

    OS.bus.on('achievement', () => this.updateChips());
    OS.bus.on('quest:update', () => this.updateChips());
    OS.bus.on('apps:changed', () => { this.renderIcons(); this.renderDock(); });
    OS.bus.on('theme', () => this.layout());
    window.addEventListener('resize', () => this.layout());

    desktop.addEventListener('contextmenu', (e) => {
      if (e.target !== desktop && e.target !== this.iconsEl && e.target !== this.layer) return;
      e.preventDefault();
      this.contextMenu(e.clientX, e.clientY);
    });

    this.keyboard();
  },

  appsInOrder() {
    return ['terminal', 'files', 'journal', 'pipedream', 'runner', 'achievements', 'settings', 'install'].filter((id) => OS.apps[id]);
  },

  isLocked(id) { return !!OS.apps[id]?.locked?.(); },

  renderIcons() {
    const { el } = OS.util;
    this.iconsEl.innerHTML = '';
    for (const id of this.appsInOrder()) {
      if (this.isLocked(id)) continue;
      const app = OS.apps[id];
      const icon = el('button', { class: 'desk-icon', title: `Open ${app.title}` },
        el('span', { class: 'app-icon', html: OS.icons[id] }), el('span', { class: 'desk-label', text: app.title }));
      icon.addEventListener('dblclick', () => this.open(id));
      icon.addEventListener('click', () => { if (matchMedia('(pointer: coarse)').matches) this.open(id); });
      icon.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.open(id); });
      this.iconsEl.append(icon);
    }
  },

  renderDock() {
    const { el } = OS.util;
    this.dock.innerHTML = '';
    for (const id of this.appsInOrder()) {
      if (this.isLocked(id)) continue;
      const app = OS.apps[id];
      const running = this.windows.some((w) => w.appId === id);
      this.dock.append(el('button', {
        class: `dock-item${running ? ' running' : ''}`, title: app.title, 'aria-label': app.title,
        html: `<span class="app-icon">${OS.icons[id]}</span>`,
        onclick: () => this.dockClick(id),
      }));
    }
  },

  dockClick(id) {
    const wins = this.windows.filter((w) => w.appId === id);
    if (!wins.length) return this.open(id);
    const top = wins[wins.length - 1];
    if (top.minimized) this.restore(top);
    else if (top.el.classList.contains('active')) this.minimize(top);
    else this.focus(top);
  },

  updateChips() {
    const done = Object.keys(OS.state.quests.done).length;
    this.questChip.textContent = `📜 ${done}/${OS.quests.list.length}`;
    const got = Object.keys(OS.state.achievements).length;
    this.trophyChip.textContent = `🏆 ${got}/${OS.achievements.list.length}`;
  },

  tickClock() {
    const d = new Date();
    this.clock.textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + '  ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  // ---------- Windows ----------
  open(appId, opts = {}) {
    const app = OS.apps[appId];
    if (!app) return null;
    this.closeLauncher();
    if (this.isLocked(appId)) {
      OS.toast({ icon: '🔒', title: `${app.title} is locked`, body: app.lockedMsg || 'Keep playing to unlock it.' });
      return null;
    }
    if (app.single) {
      const existing = this.windows.find((w) => w.appId === appId);
      if (existing) {
        if (existing.minimized) this.restore(existing);
        this.focus(existing);
        existing.api?.reopen?.(opts);
        return existing;
      }
    }
    const { el } = OS.util;
    const win = { appId, minimized: false, maximized: false, closers: [] };
    const title = el('span', { class: 'win-title', text: app.title });
    const btn = (cls, label, fn) => el('button', { class: `win-btn ${cls}`, 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); fn(); } });
    const bar = el('div', { class: 'win-titlebar' },
      el('span', { class: 'win-icon', html: OS.icons[appId] }), title,
      el('div', { class: 'win-btns' }, btn('min', 'Minimize', () => this.minimize(win)), btn('max', 'Maximize', () => this.toggleMax(win)), btn('close', 'Close', () => this.close(win))));
    const body = el('div', { class: 'win-body' });
    const resize = el('div', { class: 'win-resize', 'aria-hidden': 'true' });
    win.el = el('section', { class: `window app-${appId}`, role: 'dialog', 'aria-label': app.title }, bar, body, resize);
    win.body = body;
    win.setTitle = (t) => { title.textContent = t; };
    win.onClose = (fn) => win.closers.push(fn);
    win.close = () => this.close(win);

    // Initial placement: cascade inside the work area.
    const area = this.workArea();
    const w = Math.min(app.w, area.w - 20);
    const h = Math.min(app.h, area.h - 20);
    const n = this.windows.length;
    Object.assign(win.el.style, {
      width: `${w}px`, height: `${h}px`,
      left: `${area.x + Math.max(10, Math.min((area.w - w) / 2 + (n % 5) * 28 - 56, area.w - w - 10))}px`,
      top: `${area.y + Math.max(10, Math.min((area.h - h) / 2 + (n % 5) * 28 - 56, area.h - h - 10))}px`,
    });

    win.el.addEventListener('pointerdown', () => this.focus(win), true);
    this.makeDraggable(win, bar);
    this.makeResizable(win, resize);
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.win-btn')) this.toggleMax(win); });

    this.layer.append(win.el);
    this.windows.push(win);
    win.api = app.create(win, opts) || {};
    this.focus(win);
    this.renderDock();
    this.layout();
    requestAnimationFrame(() => win.el.classList.add('open'));
    OS.bus.emit('app:open', { id: appId });
    return win;
  },

  close(win) {
    if (!this.windows.includes(win)) return;
    win.closers.forEach((fn) => fn());
    this.windows = this.windows.filter((w) => w !== win);
    win.el.classList.remove('open');
    win.el.classList.add('closing');
    setTimeout(() => win.el.remove(), OS.util.reducedMotion() ? 0 : 160);
    const next = [...this.windows].reverse().find((w) => !w.minimized);
    if (next) this.focus(next);
    this.renderDock();
    this.layout();
  },

  focus(win) {
    if (win.el.classList.contains('active')) return;
    this.windows.forEach((w) => w.el.classList.remove('active'));
    win.el.classList.add('active');
    win.el.style.zIndex = ++this.z;
    win.api?.focus?.();
  },

  minimize(win) {
    win.minimized = true;
    win.el.classList.add('minimized');
    win.el.classList.remove('active');
    this.layout();
  },

  restore(win) {
    win.minimized = false;
    win.el.classList.remove('minimized');
    this.focus(win);
    this.layout();
  },

  toggleMax(win) {
    if (document.body.dataset.theme === 'tiling') return;
    win.maximized = !win.maximized;
    win.el.classList.toggle('maximized', win.maximized);
    win.api?.resized?.();
  },

  workArea() {
    const panel = document.getElementById('panel')?.offsetHeight || 36;
    const dock = (document.getElementById('dock')?.offsetHeight || 64) + 16;
    return { x: 0, y: panel, w: window.innerWidth, h: window.innerHeight - panel - dock };
  },

  // Master/stack tiling for the Hyprland-style theme.
  layout() {
    if (document.body.dataset.theme !== 'tiling' || window.innerWidth < 720) {
      this.windows.forEach((w) => w.api?.resized?.());
      return;
    }
    const gap = 12;
    const a = this.workArea();
    const vis = this.windows.filter((w) => !w.minimized);
    const place = (w, x, y, width, height) => {
      Object.assign(w.el.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
      w.api?.resized?.();
    };
    if (vis.length === 1) place(vis[0], a.x + gap, a.y + gap, a.w - gap * 2, a.h - gap);
    else if (vis.length > 1) {
      const masterW = Math.round((a.w - gap * 3) * 0.55);
      place(vis[0], a.x + gap, a.y + gap, masterW, a.h - gap);
      const stack = vis.slice(1);
      const h = (a.h - gap * stack.length) / stack.length;
      stack.forEach((w, i) => place(w, a.x + gap * 2 + masterW, a.y + gap + i * (h + gap), a.w - masterW - gap * 3, h));
    }
  },

  makeDraggable(win, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.win-btn') || win.maximized) return;
      if (document.body.dataset.theme === 'tiling' || window.innerWidth < 720) return;
      const startX = e.clientX; const startY = e.clientY;
      const left = win.el.offsetLeft; const top = win.el.offsetTop;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const area = this.workArea();
        win.el.style.left = `${Math.min(window.innerWidth - 80, Math.max(80 - win.el.offsetWidth, left + ev.clientX - startX))}px`;
        win.el.style.top = `${Math.min(window.innerHeight - 60, Math.max(area.y, top + ev.clientY - startY))}px`;
      };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  },

  makeResizable(win, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (document.body.dataset.theme === 'tiling' || win.maximized) return;
      e.preventDefault();
      const startX = e.clientX; const startY = e.clientY;
      const w = win.el.offsetWidth; const h = win.el.offsetHeight;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        win.el.style.width = `${Math.max(320, w + ev.clientX - startX)}px`;
        win.el.style.height = `${Math.max(220, h + ev.clientY - startY)}px`;
        win.api?.resized?.();
      };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  },

  // ---------- Launcher (Activities) ----------
  toggleLauncher() {
    if (this.launcher.hidden) this.openLauncher(); else this.closeLauncher();
  },

  openLauncher() {
    const { el } = OS.util;
    const search = el('input', { class: 'launcher-search', type: 'search', placeholder: 'Type to search apps…', 'aria-label': 'Search apps' });
    const grid = el('div', { class: 'launcher-grid' });
    const render = () => {
      const q = search.value.toLowerCase();
      grid.innerHTML = '';
      for (const id of this.appsInOrder()) {
        const app = OS.apps[id];
        if (q && !app.title.toLowerCase().includes(q) && !id.includes(q)) continue;
        const locked = this.isLocked(id);
        grid.append(el('button', { class: `launcher-app${locked ? ' locked' : ''}`, onclick: () => this.open(id) },
          el('span', { class: 'app-icon', html: OS.icons[id] }),
          el('span', { text: locked ? `🔒 ${app.title}` : app.title }),
          app.blurb && el('small', { text: app.blurb })));
      }
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') grid.querySelector('button:not(.locked)')?.click();
      if (e.key === 'Escape') this.closeLauncher();
    });
    this.launcher.innerHTML = '';
    this.launcher.append(el('div', { class: 'launcher-inner' }, search, grid));
    this.launcher.onclick = (e) => { if (e.target === this.launcher) this.closeLauncher(); };
    render();
    this.launcher.hidden = false;
    search.focus();
  },

  closeLauncher() { if (this.launcher) this.launcher.hidden = true; },

  // ---------- Menus ----------
  popup(x, y, items) {
    const { el } = OS.util;
    document.querySelector('.popup-menu')?.remove();
    const menu = el('div', { class: 'popup-menu', role: 'menu' },
      items.map(([label, fn]) => el('button', { role: 'menuitem', text: label, onclick: () => { menu.remove(); fn(); } })));
    document.getElementById('desktop').append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
    setTimeout(() => document.addEventListener('pointerdown', function off(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); }
    }), 0);
    menu.querySelector('button')?.focus();
  },

  contextMenu(x, y) {
    this.popup(x, y, [
      ['Open Terminal', () => this.open('terminal')],
      ['Open Files', () => this.open('files')],
      ['Change Wallpaper…', () => this.open('settings')],
      ['Show Tux', () => document.getElementById('tux-companion')?.classList.remove('hidden')],
    ]);
  },

  powerMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    this.popup(r.right - 180, r.bottom + 6, [
      ['Lock / Log out', () => location.reload()],
      ['Restart…', () => location.reload()],
      ['Power off…', () => OS.boot.shutdown()],
    ]);
  },

  keyboard() {
    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let pos = 0;
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); this.open('terminal'); }
      if (e.key === 'Escape') { this.closeLauncher(); document.querySelector('.popup-menu')?.remove(); }
      pos = e.key === konami[pos] ? pos + 1 : e.key === konami[0] ? 1 : 0;
      if (pos === konami.length) {
        pos = 0;
        OS.achievements.unlock('konami');
        document.getElementById('desktop').classList.add('barrel-roll');
        setTimeout(() => document.getElementById('desktop').classList.remove('barrel-roll'), 1200);
      }
    });
  },
};
