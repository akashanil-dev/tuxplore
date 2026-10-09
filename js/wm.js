'use strict';
// Window manager: windows, workspaces, desktop icons and menus. Panels and launchers come from js/de.js.

OS.apps = {};
OS.registerApp = (id, def) => { OS.apps[id] = { id, w: 720, h: 480, single: true, ...def }; };

// Each desktop environment has its own icon theme, as on real Linux (see images/icons/CREDITS.md):
// GNOME uses Adwaita, KDE Plasma uses Breeze, CDE has retro Motif-style icons, Hyprland uses Papirus.
OS.icon = (id) => `<img src="images/icons/${OS.wm?.de?.id || document.body.dataset.theme || 'kde'}/${id}.svg" alt="" draggable="false">`;

OS.wm = {
  windows: [],
  z: 10,
  layer: null,

  init() {
    const { el } = OS.util;
    const desktop = document.getElementById('desktop');
    desktop.innerHTML = '';
    desktop.hidden = false;
    this.desktop = desktop;
    this.ws = 1;

    // The desktop environment (js/de.js) builds its panels into #shell; windows and icons are shared.
    this.shell = el('div', { id: 'shell' });
    this.iconsEl = el('div', { id: 'desktop-icons' });
    this.layer = el('div', { id: 'windows' });
    this.launcher = el('div', { id: 'launcher', hidden: true });
    desktop.append(this.iconsEl, this.layer, this.shell, this.launcher, el('div', { id: 'toasts' }));

    this.buildShell();
    setInterval(() => this.tickClock(), 10000);

    OS.bus.on('achievement', () => this.updateChips());
    OS.bus.on('quest:update', () => this.updateChips());
    // An app unlocked (Try Linux): rebuild the panels too, since some list apps (CDE's Front Panel).
    OS.bus.on('apps:changed', () => this.buildShell());
    OS.bus.on('theme', () => this.switchDesktop());
    window.addEventListener('resize', () => this.layout());

    desktop.addEventListener('contextmenu', (e) => {
      if (e.target !== desktop && e.target !== this.iconsEl && e.target !== this.layer) return;
      e.preventDefault();
      const items = this.de.desktopMenu?.(this);
      if (items) this.popup(e.clientX, e.clientY, items);
    });

    this.keyboard();
  },

  buildShell() {
    this.de = OS.desktops[document.body.dataset.theme] || OS.desktops.kde;
    this.ui = {};
    this.closeLauncher();
    document.querySelector('.popup-menu')?.remove();
    this.shell.innerHTML = '';
    this.desktop.style.setProperty('--area-top', `${this.de.area.top}px`);
    this.desktop.style.setProperty('--area-bottom', `${this.de.area.bottom}px`);
    this.de.build(this, this.shell);
    this.windows.forEach((w) => { w.el.querySelector('.win-icon').innerHTML = OS.icon(w.appId); });
    this.renderIcons();
    this.updateChips();
    this.tickClock();
    this.applyWorkspace();
  },

  // Switching desktop environment: a short splash, the new shell, then Tux explains it.
  switchDesktop() {
    const { el } = OS.util;
    const de = OS.desktops[document.body.dataset.theme] || OS.desktops.kde;
    const fast = OS.util.reducedMotion();
    const splash = el('div', { class: `de-splash splash-${de.id}` }, el('div', { class: 'de-splash-inner', html: de.splash || '' }));
    this.desktop.append(splash);
    setTimeout(() => this.buildShell(), fast ? 0 : 450);
    setTimeout(() => splash.classList.add('out'), fast ? 0 : 1300);
    setTimeout(() => { splash.remove(); OS.tux.say(de.welcome, 16000); }, fast ? 0 : 1700);
  },

  appsInOrder() {
    return ['terminal', 'files', 'journal', 'pipedream', 'runner', 'achievements', 'settings', 'install'].filter((id) => OS.apps[id]);
  },

  isLocked(id) { return !!OS.apps[id]?.locked?.(); },

  renderIcons() {
    const { el } = OS.util;
    this.iconsEl.innerHTML = '';
    this.iconsEl.className = `icons-${this.de.icons || 'none'}`;
    if (this.de.icons === 'apps') {
      for (const id of this.appsInOrder()) {
        if (this.isLocked(id)) continue;
        const app = OS.apps[id];
        const icon = el('button', { class: 'desk-icon', title: `Open ${app.title}` },
          el('span', { class: 'app-icon', html: OS.icon(id) }), el('span', { class: 'desk-label', text: app.title }));
        icon.addEventListener('dblclick', () => this.open(id));
        icon.addEventListener('click', () => { if (matchMedia('(pointer: coarse)').matches) this.open(id); });
        icon.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.open(id); });
        this.iconsEl.append(icon);
      }
    } else if (this.de.icons === 'minimized') {
      // CDE style: a minimised window becomes an icon on the desktop.
      for (const win of this.windows.filter((w) => w.minimized && this.onCurrentWs(w))) {
        this.iconsEl.append(el('button', { class: 'desk-icon', title: `Restore ${win.getTitle()}`, onclick: () => this.restore(win) },
          el('span', { class: 'app-icon', html: OS.icon(win.appId) }), el('span', { class: 'desk-label', text: win.getTitle() })));
      }
    }
  },

  // Redraws whatever shows running apps: docks, taskbars, workspace buttons, minimised icons.
  refresh() {
    if (!this.de) return;
    if (this.de.icons === 'minimized') this.renderIcons();
    this.de.refresh?.(this);
  },

  // A launcher button for an app, with a dot when it's running. Used by docks and taskbars.
  appButton(id, cls = 'dock-item') {
    const { el } = OS.util;
    const app = OS.apps[id];
    const wins = this.windows.filter((w) => w.appId === id);
    const active = wins.some((w) => w.el.classList.contains('active') && !w.minimized && this.onCurrentWs(w));
    return el('button', {
      class: `${cls}${wins.length ? ' running' : ''}${active ? ' focused' : ''}`, title: app.title, 'aria-label': app.title,
      html: `<span class="app-icon">${OS.icon(id)}</span>`,
      onclick: () => this.activate(id),
    });
  },

  activate(id) {
    const overview = !this.launcher.hidden;
    this.closeLauncher();
    const wins = this.windows.filter((w) => w.appId === id);
    if (!wins.length) return this.open(id);
    const top = wins[wins.length - 1];
    if (this.de.workspaces && top.ws !== this.ws) this.switchWs(top.ws);
    if (top.minimized) this.restore(top);
    else if (top.el.classList.contains('active') && !overview && this.de.minimize !== false) this.minimize(top);
    else this.focus(top);
  },

  appGrid(query = '') {
    const { el } = OS.util;
    const q = query.toLowerCase();
    return el('div', { class: 'launcher-grid' }, this.appsInOrder()
      .filter((id) => !q || OS.apps[id].title.toLowerCase().includes(q) || id.includes(q))
      .map((id) => {
        const app = OS.apps[id];
        const locked = this.isLocked(id);
        return el('button', { class: `launcher-app${locked ? ' locked' : ''}`, onclick: () => this.open(id) },
          el('span', { class: 'app-icon', html: OS.icon(id) }),
          el('span', { text: locked ? `🔒 ${app.title}` : app.title }),
          app.blurb && el('small', { text: app.blurb }));
      }));
  },

  searchApps(query) {
    const q = query.toLowerCase().trim();
    return this.appsInOrder().filter((id) => !q || OS.apps[id].title.toLowerCase().includes(q) || id.includes(q) || (OS.apps[id].blurb || '').toLowerCase().includes(q));
  },

  chip(kind) {
    return OS.util.el('button', {
      class: `panel-chip chip-${kind}`,
      title: kind === 'quest' ? 'Quest journal' : 'Achievements',
      onclick: () => this.open(kind === 'quest' ? 'journal' : 'achievements'),
    });
  },

  updateChips() {
    const done = Object.keys(OS.state.quests.done).length;
    const got = Object.keys(OS.state.achievements).length;
    this.desktop.querySelectorAll('.chip-quest').forEach((c) => { c.textContent = `📜 ${done}/${OS.quests.list.length}`; });
    this.desktop.querySelectorAll('.chip-trophy').forEach((c) => { c.textContent = `🏆 ${got}/${OS.achievements.list.length}`; });
  },

  // Every element with data-clock gets the time in its own format.
  tickClock() {
    const d = new Date();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const formats = {
      gnome: () => `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}  ${time}`,
      time: () => time,
      date: () => d.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: '2-digit' }),
      month: () => d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
      day: () => String(d.getDate()),
      weekday: () => d.toLocaleDateString(undefined, { weekday: 'short' }),
      hypr: () => `${d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}  ${time}`,
    };
    this.desktop.querySelectorAll('[data-clock]').forEach((c) => {
      if (c.dataset.clock === 'analog') {
        const h = (d.getHours() % 12) * 30 + d.getMinutes() / 2;
        const m = d.getMinutes() * 6;
        c.querySelector('.hand-h')?.setAttribute('transform', `rotate(${h} 20 20)`);
        c.querySelector('.hand-m')?.setAttribute('transform', `rotate(${m} 20 20)`);
      } else c.textContent = formats[c.dataset.clock]?.() ?? time;
    });
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
    const win = { appId, minimized: false, maximized: false, closers: [], ws: this.ws };
    const title = el('span', { class: 'win-title', text: app.title });
    const btn = (cls, label, fn) => el('button', { class: `win-btn ${cls}`, 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); fn(e); } });
    // Every button is always there; each desktop environment's CSS shows its own set (CDE uses the window menu).
    const menuBtn = btn('menu', 'Window menu', (e) => this.windowMenu(win, e));
    menuBtn.addEventListener('dblclick', (e) => { e.stopPropagation(); this.close(win); });
    const bar = el('div', { class: 'win-titlebar' },
      menuBtn, el('span', { class: 'win-icon', html: OS.icon(appId) }), title,
      el('div', { class: 'win-btns' }, btn('min', 'Minimize', () => this.minimize(win)), btn('max', 'Maximize', () => this.toggleMax(win)), btn('close', 'Close', () => this.close(win))));
    const body = el('div', { class: 'win-body' });
    const resize = el('div', { class: 'win-resize', 'aria-hidden': 'true' });
    win.el = el('section', { class: `window app-${appId}`, role: 'dialog', 'aria-label': app.title }, bar, body, resize);
    win.body = body;
    win.setTitle = (t) => { title.textContent = t; this.refresh(); };
    win.getTitle = () => title.textContent;
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
    this.refresh();
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
    this.focusTop();
    this.refresh();
    this.layout();
    this.syncMaximized();
  },

  visibleWindows() { return this.windows.filter((w) => !w.minimized && this.onCurrentWs(w)); },
  onCurrentWs(w) { return !this.de?.workspaces || w.ws === this.ws; },
  activeWindow() { return this.visibleWindows().find((w) => w.el.classList.contains('active')); },
  focusTop() {
    const next = this.visibleWindows().sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
    if (next) this.focus(next);
  },

  // ---------- Workspaces (CDE and Hyprland) ----------
  applyWorkspace() {
    this.windows.forEach((w) => w.el.classList.toggle('offws', !this.onCurrentWs(w)));
    if (!this.activeWindow()) this.focusTop();
    this.syncMaximized();
    this.layout();
    this.refresh();
  },

  switchWs(n) {
    if (!this.de.workspaces || n < 1 || n > this.de.workspaces.length) return;
    this.ws = n;
    this.applyWorkspace();
  },

  moveToWs(win, n) {
    if (!win || !this.de.workspaces || n < 1 || n > this.de.workspaces.length) return;
    win.ws = n;
    win.el.classList.remove('active');
    this.applyWorkspace();
  },

  // KDE's "Peek at Desktop": minimise everything, and click again to bring it back.
  peek() {
    if (this.peeked?.length) {
      this.peeked.filter((w) => this.windows.includes(w)).forEach((w) => this.restore(w));
      this.peeked = null;
      return;
    }
    this.peeked = this.visibleWindows();
    this.peeked.forEach((w) => this.minimize(w));
  },

  focus(win) {
    if (win.el.classList.contains('active')) return;
    this.windows.forEach((w) => w.el.classList.remove('active'));
    win.el.classList.add('active');
    win.el.style.zIndex = ++this.z;
    win.api?.focus?.();
    this.refresh();
  },

  minimize(win) {
    win.minimized = true;
    win.el.classList.add('minimized');
    win.el.classList.remove('active');
    this.focusTop();
    this.layout();
    this.syncMaximized();
    this.refresh();
  },

  restore(win) {
    if (this.de.workspaces && win.ws !== this.ws) this.switchWs(win.ws);
    win.minimized = false;
    win.el.classList.remove('minimized');
    this.focus(win);
    this.layout();
    this.syncMaximized();
    this.refresh();
  },

  toggleMax(win) {
    if (this.de.tiling) return;
    win.maximized = !win.maximized;
    win.el.classList.toggle('maximized', win.maximized);
    this.syncMaximized();
    win.api?.resized?.();
  },

  syncMaximized() {
    document.body.classList.toggle('has-maximized', this.visibleWindows().some((w) => w.maximized));
  },

  workArea() {
    const { top, bottom } = this.de.area;
    return { x: 0, y: top, w: window.innerWidth, h: window.innerHeight - top - bottom };
  },

  // Master/stack tiling for Hyprland.
  layout() {
    if (!this.de?.tiling || window.innerWidth < 720) {
      this.windows.forEach((w) => w.api?.resized?.());
      return;
    }
    const gap = 12;
    const a = this.workArea();
    const vis = this.visibleWindows();
    const place = (w, x, y, width, height) => {
      Object.assign(w.el.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
      w.api?.resized?.();
    };
    if (vis.length === 1) place(vis[0], a.x + gap, a.y + gap, a.w - gap * 2, a.h - gap * 2);
    else if (vis.length > 1) {
      const masterW = Math.round((a.w - gap * 3) * 0.55);
      place(vis[0], a.x + gap, a.y + gap, masterW, a.h - gap * 2);
      const stack = vis.slice(1);
      const h = (a.h - gap * (stack.length + 1)) / stack.length;
      stack.forEach((w, i) => place(w, a.x + gap * 2 + masterW, a.y + gap + i * (h + gap), a.w - masterW - gap * 3, h));
    }
  },

  makeDraggable(win, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.win-btn') || win.maximized) return;
      if (this.de.tiling || window.innerWidth < 720) return;
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
      if (this.de.tiling || win.maximized) return;
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

  // ---------- Launcher ----------
  // Each desktop environment draws its own: GNOME's overview, KDE's Kickoff, Hyprland's wofi.
  toggleLauncher() {
    if (this.launcher.hidden) this.de.openLauncher?.(this); else this.closeLauncher();
  },

  showOverlay(cls, ...content) {
    this.launcher.innerHTML = '';
    this.launcher.className = `overlay-${cls}`;
    this.launcher.append(...content);
    this.launcher.onclick = (e) => { if (e.target === this.launcher) this.closeLauncher(); };
    this.launcher.hidden = false;
  },

  closeLauncher() {
    if (!this.launcher || this.launcher.hidden) return;
    this.launcher.hidden = true;
    this.launcher.innerHTML = '';
  },

  // A search box over a list of apps: arrows move, Enter opens. KRunner and wofi use it.
  appSearch(cls, placeholder) {
    const { el } = OS.util;
    const input = el('input', { class: `${cls}-input`, type: 'search', placeholder, 'aria-label': 'Search apps', spellcheck: 'false' });
    const list = el('div', { class: `${cls}-list`, role: 'listbox' });
    let sel = 0;
    const render = () => {
      const ids = this.searchApps(input.value);
      sel = Math.min(sel, Math.max(0, ids.length - 1));
      list.innerHTML = '';
      ids.forEach((id, i) => list.append(el('button', {
        class: `${cls}-row${i === sel ? ' sel' : ''}${this.isLocked(id) ? ' locked' : ''}`, role: 'option',
        onclick: () => this.open(id),
      }, el('span', { class: 'app-icon', html: OS.icon(id) }), el('span', { text: OS.apps[id].title }), el('small', { text: OS.apps[id].blurb || '' }))));
    };
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      const rows = list.children.length;
      if (e.key === 'ArrowDown' && rows) { sel = (sel + 1) % rows; render(); e.preventDefault(); }
      if (e.key === 'ArrowUp' && rows) { sel = (sel - 1 + rows) % rows; render(); e.preventDefault(); }
      if (e.key === 'Enter') list.children[sel]?.click();
      if (e.key === 'Escape') this.closeLauncher();
    });
    render();
    return { input, list };
  },

  // ---------- Menus ----------
  // items: [label, fn] pairs, a string for a heading, or null for a separator.
  popup(x, y, items) {
    const { el } = OS.util;
    document.querySelector('.popup-menu')?.remove();
    const menu = el('div', { class: 'popup-menu', role: 'menu' }, items.map((item) => {
      if (item === null) return el('hr');
      if (typeof item === 'string') return el('p', { class: 'popup-title', text: item });
      const [label, fn] = item;
      return el('button', { role: 'menuitem', text: label, onclick: () => { menu.remove(); fn(); } });
    }));
    document.getElementById('desktop').append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
    setTimeout(() => document.addEventListener('pointerdown', function off(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); }
    }), 0);
    menu.querySelector('button')?.focus();
  },

  powerItems() {
    return [
      ['Lock / Log out', () => location.reload()],
      ['Restart…', () => location.reload()],
      ['Power off…', () => OS.boot.shutdown()],
    ];
  },

  powerMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const below = r.top < window.innerHeight / 2;
    this.popup(r.right - 180, below ? r.bottom + 6 : r.top - 140, this.powerItems());
  },

  // The Motif window menu CDE puts behind the button in each title bar.
  windowMenu(win, e) {
    const r = e.currentTarget.getBoundingClientRect();
    const ws = this.de.workspaces || [];
    this.popup(r.left, r.bottom + 2, [
      ['Restore', () => { if (win.maximized) this.toggleMax(win); }],
      ['Minimize', () => this.minimize(win)],
      ['Maximize', () => { if (!win.maximized) this.toggleMax(win); }],
      ...(ws.length ? [null, ...ws.map((name, i) => [`Occupy Workspace ${name}`, () => this.moveToWs(win, i + 1)])] : []),
      null,
      ['Close', () => this.close(win)],
    ]);
  },

  keyboard() {
    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let pos = 0;
    let superAlone = false;
    // Desktop shortcuts run first (capture), so they work even inside the terminal.
    document.addEventListener('keydown', (e) => {
      superAlone = e.key === 'Meta' && !e.repeat;
      if (!document.getElementById('boot').hidden) return;
      if (this.de.keydown?.(e, this)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('keyup', (e) => {
      // Tapping Super on its own opens the launcher, as on GNOME and KDE.
      if (e.key === 'Meta' && superAlone) this.de.superTap?.(this);
      superAlone = false;
    });
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
