'use strict';
// Desktop environments. Each one builds its own shell (panels, menus, launcher, shortcuts) around the
// shared window manager in wm.js, so switching between them feels like logging into a different desktop.
//
// A desktop environment is an object with:
//   area        space its panels take at the top and bottom, which windows stay out of
//   icons       'apps' (desktop icons), 'minimized' (CDE: minimised windows become icons) or false
//   openHow()   how to open an app here, in words, for Tux's hints
//   guide       optional cheat sheet Tux adds to every hint ({title, intro, keys, foot})
//   workspaces  names of its workspaces, or false
//   tiling      windows tile themselves (Hyprland)
//   build()     draws the panels; refresh() updates them when windows change
//   openLauncher(), superTap(), keydown(), desktopMenu()

(() => {
  const { el } = OS.util;

  const ICON = {
    wifi: '<svg viewBox="0 0 16 16"><path d="M1.5 6a9.5 9.5 0 0 1 13 0M3.8 8.6a6.2 6.2 0 0 1 8.4 0M6.1 11.1a2.9 2.9 0 0 1 3.8 0"/><circle cx="8" cy="13.4" r=".9" fill="currentColor" stroke="none"/></svg>',
    volume: '<svg viewBox="0 0 16 16"><path d="M2 6h2.5L8 3v10l-3.5-3H2z" fill="currentColor" stroke="none"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.4 3.6a6.2 6.2 0 0 1 0 8.8"/></svg>',
    battery: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4.5" width="11.5" height="7" rx="1.5"/><rect x="3" y="6" width="7" height="4" rx=".5" fill="currentColor" stroke="none"/><path d="M14.5 7v2"/></svg>',
    power: '<svg viewBox="0 0 16 16"><path d="M8 1.5v6"/><path d="M4.4 3.6a5.5 5.5 0 1 0 7.2 0"/></svg>',
    grid: '<svg viewBox="0 0 16 16">' + [2, 7, 12].flatMap((y) => [2, 7, 12].map((x) => `<circle cx="${x}" cy="${y}" r="1.5" fill="currentColor" stroke="none"/>`)).join('') + '</svg>',
    search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>',
    lock: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7.5" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>',
  };
  const status = () => el('span', { class: 'status-icons', html: ICON.wifi + ICON.volume + ICON.battery });
  // CDE's front panel clock is analog; wm.tickClock() turns the hands.
  const analogClock = () => el('span', {
    class: 'cde-analog', 'data-clock': 'analog',
    html: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/>' + Array.from({ length: 12 }, (_, i) => `<path d="M20 4.5v3" transform="rotate(${i * 30} 20 20)"/>`).join('')
      + '<path class="hand-h" d="M20 20V11"/><path class="hand-m" d="M20 20V7"/></svg>',
  });

  // KDE's Kickoff sorts apps into categories.
  const CATEGORY = { terminal: 'System', files: 'System', install: 'System', journal: 'Education', pipedream: 'Games', runner: 'Games', achievements: 'Games', settings: 'Settings' };
  const FAVORITES = ['terminal', 'files', 'journal', 'settings'];

  OS.desktops = {
    // ---------- GNOME ----------
    gnome: {
      id: 'gnome',
      area: { top: 34, bottom: 0 },
      icons: false,
      workspaces: false,
      minimize: false,
      openHow: (title) => `click Activities in the top-left corner, then ${title} in the dash at the bottom`,
      welcome: 'This is GNOME, the desktop on Fedora and Ubuntu. It keeps things calm: no desktop icons, no taskbar. Click Activities in the top-left corner (or push your mouse into that corner) to see your windows and apps.',
      splash: '',
      build(wm, shell) {
        const corner = el('div', { class: 'hot-corner', 'aria-hidden': 'true' });
        corner.addEventListener('pointerenter', () => wm.toggleLauncher());
        shell.append(corner, el('header', { class: 'gnome-bar' },
          el('div', { class: 'bar-side' }, el('button', { class: 'panel-chip gnome-activities', text: 'Activities', onclick: () => wm.toggleLauncher() })),
          el('span', { class: 'gnome-clock', 'data-clock': 'gnome' }),
          el('div', { class: 'bar-side bar-right' }, wm.chip('quest'), wm.chip('trophy'),
            el('button', { class: 'panel-chip gnome-status', title: 'System menu', 'aria-label': 'System menu', html: ICON.wifi + ICON.volume + ICON.power, onclick: (e) => wm.powerMenu(e) }))));
      },
      // The Activities overview: open windows in the middle, the dash at the bottom, search on top.
      openLauncher(wm) {
        const search = el('input', { class: 'launcher-search', type: 'search', placeholder: 'Type to search', 'aria-label': 'Search apps' });
        const main = el('div', { class: 'ov-main' });
        const showWindows = () => {
          main.innerHTML = '';
          if (!wm.windows.length) { main.append(el('p', { class: 'ov-empty', text: 'No open windows. Pick an app from the dash below.' })); return; }
          main.append(el('div', { class: 'ov-windows' }, wm.windows.map((w) => el('button', {
            class: `ov-win${w.el.classList.contains('active') ? ' active' : ''}`,
            onclick: () => { wm.closeLauncher(); if (w.minimized) wm.restore(w); else wm.focus(w); },
          }, el('span', { class: 'ov-thumb' }, el('span', { class: 'app-icon', html: OS.icon(w.appId) })),
          el('span', { class: 'ov-label', text: w.getTitle() })))));
        };
        const showApps = () => { main.innerHTML = ''; main.append(wm.appGrid(search.value)); };
        search.addEventListener('input', () => (search.value ? showApps() : showWindows()));
        search.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') main.querySelector('.launcher-app:not(.locked)')?.click();
          if (e.key === 'Escape') wm.closeLauncher();
        });
        const dash = el('nav', { class: 'gnome-dash', 'aria-label': 'Dash' },
          wm.appsInOrder().filter((id) => !wm.isLocked(id)).map((id) => wm.appButton(id)),
          el('span', { class: 'dash-sep' }),
          el('button', { class: 'dock-item show-apps', title: 'Show Apps', 'aria-label': 'Show Apps', html: ICON.grid, onclick: showApps }));
        wm.showOverlay('gnome-overview', el('div', { class: 'ov-inner' }, search, main), dash);
        showWindows();
        search.focus();
      },
      superTap(wm) { wm.toggleLauncher(); },
      desktopMenu(wm) {
        return [
          ['Change Background…', () => wm.open('settings')],
          ['Settings', () => wm.open('settings')],
          ['Show Tux', () => document.getElementById('tux-companion')?.classList.remove('hidden')],
        ];
      },
    },

    // ---------- KDE Plasma ----------
    kde: {
      id: 'kde',
      area: { top: 0, bottom: 44 },
      icons: 'apps',
      workspaces: false,
      openHow: (title) => `double-click ${title} on the desktop, or open the app launcher in the bottom-left corner and pick it`,
      welcome: 'Welcome to KDE Plasma! It works a lot like Windows: the app launcher is in the bottom-left corner, open apps sit in the taskbar, and the clock is on the right. Press Alt+Space to search with KRunner.',
      splash: '<div class="plasma-logo"></div><strong>Plasma</strong><span class="plasma-bar"><i></i></span>',
      build(wm, shell) {
        wm.ui.tasks = el('div', { class: 'kde-tasks' });
        shell.append(el('footer', { class: 'kde-panel' },
          el('button', { class: 'kde-kickoff', title: 'Application Launcher', 'aria-label': 'Application Launcher', html: OS.tuxSvg(), onclick: () => wm.toggleLauncher() }),
          wm.ui.tasks,
          el('div', { class: 'kde-tray' }, wm.chip('quest'), wm.chip('trophy'), status(),
            el('div', { class: 'kde-clock' }, el('span', { 'data-clock': 'time' }), el('small', { 'data-clock': 'date' })),
            el('button', { class: 'kde-tray-btn', title: 'Shut down or log out', 'aria-label': 'Power menu', html: ICON.power, onclick: (e) => wm.powerMenu(e) })),
          el('button', { class: 'kde-peek', title: 'Peek at Desktop', 'aria-label': 'Peek at Desktop', onclick: () => wm.peek() })));
      },
      // Icons-only task manager: pinned apps first, then anything else that's running.
      refresh(wm) {
        if (!wm.ui.tasks) return;
        const ids = [...FAVORITES, ...wm.windows.map((w) => w.appId)].filter((id, i, all) => all.indexOf(id) === i && !wm.isLocked(id));
        wm.ui.tasks.replaceChildren(...ids.map((id) => wm.appButton(id, 'kde-task')));
      },
      openLauncher(wm) {
        const cats = ['Favorites', 'All Applications', ...new Set(wm.appsInOrder().map((id) => CATEGORY[id] || 'System'))];
        let cat = 'Favorites';
        const search = el('input', { class: 'kick-search', type: 'search', placeholder: 'Search…', 'aria-label': 'Search apps' });
        const side = el('div', { class: 'kick-cats' });
        const list = el('div', { class: 'kick-list' });
        const render = () => {
          side.replaceChildren(...cats.map((c) => {
            const b = el('button', { class: `kick-cat${c === cat && !search.value ? ' sel' : ''}`, text: c, onclick: () => { cat = c; search.value = ''; render(); } });
            b.addEventListener('pointerenter', () => { if (cat !== c && !search.value) { cat = c; render(); } });
            return b;
          }));
          const ids = search.value ? wm.searchApps(search.value)
            : cat === 'Favorites' ? FAVORITES.filter((id) => OS.apps[id])
              : cat === 'All Applications' ? wm.appsInOrder() : wm.appsInOrder().filter((id) => (CATEGORY[id] || 'System') === cat);
          list.replaceChildren(...ids.map((id) => el('button', { class: `kick-app${wm.isLocked(id) ? ' locked' : ''}`, onclick: () => wm.open(id) },
            el('span', { class: 'app-icon', html: OS.icon(id) }),
            el('span', {}, el('strong', { text: OS.apps[id].title }), el('small', { text: OS.apps[id].blurb || '' })))));
        };
        search.addEventListener('input', render);
        search.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('.kick-app:not(.locked)')?.click(); });
        const foot = el('div', { class: 'kick-foot' },
          el('button', { text: 'Lock', onclick: () => location.reload() }),
          el('button', { text: 'Restart', onclick: () => location.reload() }),
          el('button', { text: 'Shut Down', onclick: () => OS.boot.shutdown() }));
        wm.showOverlay('kde-kickoff', el('div', { class: 'kickoff' },
          el('div', { class: 'kick-head' }, el('span', { class: 'kick-avatar', html: OS.tuxSvg() }), el('strong', { text: OS.state.username }), search),
          el('div', { class: 'kick-body' }, side, list), foot));
        render();
        search.focus();
      },
      openKRunner(wm) {
        const { input, list } = wm.appSearch('krunner', 'Search…');
        wm.showOverlay('kde-krunner', el('div', { class: 'krunner' }, el('div', { class: 'krunner-bar' }, el('span', { class: 'krunner-icon', html: ICON.search }), input), list));
        input.focus();
      },
      superTap(wm) { wm.toggleLauncher(); },
      keydown(e, wm) {
        if (e.altKey && !e.ctrlKey && (e.code === 'Space' || e.key === 'F2')) { this.openKRunner(wm); return true; }
        if (e.altKey && !e.ctrlKey && e.key === 'F1') { wm.toggleLauncher(); return true; }
        return false;
      },
      desktopMenu(wm) {
        return [
          ['Open Terminal', () => wm.open('terminal')],
          ['Open Files', () => wm.open('files')],
          null,
          ['Configure Desktop and Wallpaper…', () => wm.open('settings')],
          ['Show Tux', () => document.getElementById('tux-companion')?.classList.remove('hidden')],
        ];
      },
    },

    // ---------- CDE ----------
    retro: {
      id: 'retro',
      area: { top: 0, bottom: 86 },
      icons: 'minimized',
      workspaces: ['One', 'Two', 'Three', 'Four'],
      openHow: (title) => `click the ${title} button in the Front Panel at the bottom`,
      welcome: 'Welcome to CDE, the desktop of 1990s Unix workstations from Sun, HP and IBM. Everything lives in the Front Panel at the bottom, including four workspaces: put different windows on each. A minimised window turns into an icon on the desktop.',
      splash: '<p>Starting the Common Desktop Environment…</p>',
      build(wm, shell) {
        const launch = (id) => (wm.isLocked(id) ? null : el('button', { class: 'cde-tile cde-launch', title: OS.apps[id].title, 'aria-label': OS.apps[id].title, html: `<span class="app-icon">${OS.icon(id)}</span>`, onclick: () => wm.activate(id) }));
        wm.ui.ws = this.workspaces.map((name, i) => el('button', { class: 'cde-ws', text: name, onclick: () => wm.switchWs(i + 1) }));
        shell.append(el('footer', { class: 'cde-panel' },
          el('div', { class: 'cde-tile', title: 'Clock' }, analogClock()),
          el('div', { class: 'cde-tile cde-cal', title: 'Calendar' }, el('small', { 'data-clock': 'month' }), el('strong', { 'data-clock': 'day' })),
          launch('terminal'), launch('files'), launch('journal'),
          el('div', { class: 'cde-switch' },
            el('button', { class: 'cde-ctl', title: 'Lock screen', 'aria-label': 'Lock screen', html: ICON.lock, onclick: () => location.reload() }),
            el('div', { class: 'cde-ws-grid' }, wm.ui.ws),
            el('button', { class: 'cde-ctl cde-exit', text: 'EXIT', title: 'Log out', onclick: () => OS.boot.shutdown() })),
          launch('pipedream'), launch('runner'), launch('settings'), launch('install'),
          el('div', { class: 'cde-tile cde-chips' }, wm.chip('quest'), wm.chip('trophy'))));
      },
      refresh(wm) {
        wm.ui.ws?.forEach((b, i) => b.classList.toggle('sel', wm.ws === i + 1));
      },
      openLauncher(wm) { wm.popup(window.innerWidth / 2 - 90, window.innerHeight - 380, this.desktopMenu(wm)); },
      // CDE's Workspace Menu: right-click the desktop.
      desktopMenu(wm) {
        return ['Workspace Menu',
          ...wm.appsInOrder().filter((id) => !wm.isLocked(id)).map((id) => [OS.apps[id].title, () => wm.open(id)]),
          null,
          ['Refresh Workspace', () => wm.applyWorkspace()],
          ['Log out…', () => OS.boot.shutdown()]];
      },
    },

    // ---------- Hyprland ----------
    tiling: {
      id: 'tiling',
      area: { top: 44, bottom: 0 },
      icons: false,
      workspaces: ['1', '2', '3', '4', '5'],
      tiling: true,
      openHow: (title) => (title === 'Terminal' ? 'press Super+Q (or Alt+Q)' : `press Super+R (or Alt+R) and type ${title}`),
      welcome: 'Welcome to Hyprland, a tiling window manager. Windows arrange themselves, and you drive it from the keyboard: Super+Q opens a terminal, Super+R the app launcher, Super+C closes a window, Super+1 to 5 switch workspaces and Super+Shift+1 to 5 move a window there. If your computer grabs the Super key, use Alt.',
      splash: '<strong class="hypr-logo">Hyprland</strong>',
      // Tux shows this with every hint here: Hyprland works nothing like the other desktops.
      guide: {
        title: 'Getting around Hyprland',
        intro: 'No title bars, taskbar or desktop icons here. Windows tile themselves, and you drive it with the keyboard.',
        keys: [
          ['Super+Q', 'Open a terminal'],
          ['Super+R', 'Find and open any app'],
          ['Super+E', 'Open Files'],
          ['Super+C', 'Close the focused window'],
          ['Super+← →', 'Move between windows'],
          ['Super+1…5', 'Switch workspace'],
          ['Super+Shift+1…5', 'Send the window to a workspace'],
        ],
        foot: "Super is the Windows key; if your computer grabs it, use Alt. With the mouse: the numbers in the top-left are workspaces, the Tux there opens your apps, and the window title in the middle has window actions.",
      },
      build(wm, shell) {
        wm.ui.ws = this.workspaces.map((name, i) => el('button', { class: 'hypr-ws', text: name, title: `Workspace ${name} (Super+${name})`, onclick: () => wm.switchWs(i + 1) }));
        wm.ui.title = el('button', {
          class: 'hypr-title', title: 'Window actions',
          onclick: (e) => {
            const win = wm.activeWindow();
            if (!win) return;
            const r = e.currentTarget.getBoundingClientRect();
            wm.popup(r.left, r.bottom + 6, [
              ...this.workspaces.map((name, i) => [`Move to workspace ${name}`, () => wm.moveToWs(win, i + 1)]),
              null, ['Close window (Super+C)', () => wm.close(win)]]);
          },
        });
        shell.append(el('header', { class: 'waybar' },
          el('div', { class: 'wb-side' },
            el('button', { class: 'wb-launch', title: 'Apps (Super+R)', 'aria-label': 'Apps', html: OS.tuxSvg(), onclick: () => wm.toggleLauncher() }),
            el('div', { class: 'wb-ws' }, wm.ui.ws)),
          wm.ui.title,
          el('div', { class: 'wb-side wb-right' }, wm.chip('quest'), wm.chip('trophy'), status(),
            el('span', { class: 'wb-clock', 'data-clock': 'hypr' }),
            el('button', { class: 'wb-power', title: 'Power', 'aria-label': 'Power menu', html: ICON.power, onclick: (e) => wm.powerMenu(e) }))));
      },
      refresh(wm) {
        if (!wm.ui.ws) return;
        wm.ui.ws.forEach((b, i) => {
          b.classList.toggle('sel', wm.ws === i + 1);
          b.classList.toggle('occupied', wm.windows.some((w) => w.ws === i + 1));
        });
        const win = wm.activeWindow();
        wm.ui.title.textContent = win ? win.getTitle() : '';
        wm.ui.title.disabled = !win;
      },
      // wofi, the launcher many Hyprland setups use.
      openLauncher(wm) {
        const { input, list } = wm.appSearch('wofi', 'drun');
        wm.showOverlay('hypr-wofi', el('div', { class: 'wofi' }, input, list));
        input.focus();
      },
      keydown(e, wm) {
        const mod = e.metaKey || (e.altKey && !e.ctrlKey);
        if (!mod || e.key === 'Meta' || e.key === 'Alt') return false;
        const n = /^Digit([1-5])$/.exec(e.code);
        const win = wm.activeWindow();
        if (n) { if (e.shiftKey) wm.moveToWs(win, +n[1]); else wm.switchWs(+n[1]); return true; }
        const vis = wm.visibleWindows();
        const step = (d) => { if (vis.length && win) wm.focus(vis.at((vis.indexOf(win) + d) % vis.length)); };
        switch (e.key.toLowerCase()) {
          case 'q': case 'enter': wm.open('terminal'); return true;
          case 'c': if (win) wm.close(win); return true;
          case 'e': wm.open('files'); return true;
          case 'r': case 'd': wm.toggleLauncher(); return true;
          case 'arrowright': case 'arrowdown': step(1); return true;
          case 'arrowleft': case 'arrowup': step(-1); return true;
          default: return false;
        }
      },
    },
  };
})();
