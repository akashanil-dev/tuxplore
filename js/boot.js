'use strict';
// Boot flow: GRUB menu -> kernel/systemd log -> login screen -> desktop session.
// Also the kernel panic and shutdown screens.

OS.boot = {
  screen: null,
  loginTimers: [],

  start() {
    this.screen = document.getElementById('boot');
    if (this.isPhone() && !this.bootAnyway) { OS.analytics.event('phone_screen'); return this.phone(); }
    OS.analytics.event('boot');
    if (OS.state.fastBoot && OS.state.username) return this.login();
    this.grub();
  },

  // A phone: a touch screen that's small in both directions (so tablets still boot).
  isPhone() {
    const touch = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
    return touch && Math.min(window.screen.width, window.screen.height) < 600;
  },

  // ---------- Phones: a joke kernel panic, then the way out ----------
  // Drawn like the rest of the boot: the panic scrolls past, then Tux opens a rescue shell with a
  // GRUB-style menu of what to do instead.
  async phone() {
    const { el, sleep } = OS.util;
    const pause = (ms) => sleep(OS.util.reducedMotion() ? 0 : ms);
    const screen = this.show('phone');
    const log = el('pre', { class: 'phone-log' });
    screen.append(log);
    const inches = (Math.hypot(window.screen.width, window.screen.height) / 160).toFixed(1);
    const lines = [
      ['0.000000', 'Linux version 6.10.0-tuxos (tux@igloo) #1 SMP PREEMPT'],
      ['0.004201', 'DMI: Pocket-Sized Glass Rectangle, BIOS "swipe up to unlock"'],
      ['0.011000', `Detecting screen... ${inches} inches. Hmm.`],
      ['0.013370', 'Detecting keyboard... not found'],
      ['0.013371', 'Detecting mouse... found a thumb instead'],
      ['0.020000', 'tux-wm: trying to fit 4 desktop environments into a phone...'],
      ['0.020001', 'tux-wm: windows are now 3 pixels wide'],
      ['0.042000', 'Kernel panic - not syncing: Attempted to run a whole operating system inside a phone browser', 'panic'],
      ['0.042001', '---[ end Kernel panic - not syncing ]---', 'panic'],
    ];
    for (const [time, text, cls] of lines) {
      log.append(el('span', { class: `phone-line ${cls || ''}` }, el('span', { class: 'phone-time', text: `[${time}]` }), ` ${text}`));
      await pause(140);
    }
    await pause(500);

    const url = location.origin + location.pathname;
    const item = (label, note, onclick, attrs = {}) => el(attrs.href ? 'a' : 'button', { class: 'phone-item', type: attrs.href ? null : 'button', onclick, ...attrs },
      el('span', { class: 'phone-item-label', text: label }), el('span', { class: 'phone-item-note', text: note }));
    const copy = item('Copy the link', 'Paste it into a browser on your computer', async () => {
      const label = copy.querySelector('.phone-item-label');
      try { await navigator.clipboard.writeText(url); label.textContent = 'Copied!'; copy.classList.add('done'); } catch { label.textContent = url; }
    });
    copy.classList.add('sel');
    const share = navigator.share && item('Send it to my computer', 'Share the link to yourself', () => navigator.share({ title: 'Tuxplore', text: 'Learn Linux by playing, in a desktop browser:', url }).catch(() => {}));
    const menu = el('div', { class: 'phone-menu', role: 'group', 'aria-label': 'What now?' },
      el('span', { class: 'phone-menu-title', text: ' What now? ' }),
      copy, share || null,
      item('Read about Tuxplore', 'What it is and what you\'ll learn', null, { href: 'about.html' }),
      item('Boot anyway', 'It will be very cramped', () => { this.bootAnyway = true; this.start(); }));

    screen.append(el('section', { class: 'phone-rescue' },
      el('p', { class: 'phone-prompt' }, el('span', { class: 'c-green', text: 'tux@rescue' }), ':', el('span', { class: 'c-blue', text: '~' }), '$ cat /etc/motd'),
      el('div', { class: 'phone-motd' },
        el('div', { class: 'phone-tux', html: OS.tuxSvg() }),
        el('div', {},
          el('h1', { text: 'Whoa, that\'s a phone!' }),
          el('p', { text: 'TuxOS is a whole operating system: windows, a terminal, keyboard shortcuts and four desktops. Your phone tried its best, but Linux needs a real keyboard and a bigger screen.' }))),
      el('p', { class: 'phone-fix' }, 'Open ', el('strong', { text: location.host || 'Tuxplore' }), ' on a laptop or desktop computer.'),
      menu,
      el('p', { class: 'phone-foot' }, el('span', { class: 'c-dim', text: 'Tablets and computers boot straight in.' }))));
  },

  show(cls, html = '') {
    this.screen.onkeydown = null;
    this.screen.hidden = false;
    this.screen.className = cls;
    this.screen.innerHTML = html;
    return this.screen;
  },

  // Resolves on the next key press or click anywhere.
  anyKey() {
    return new Promise((resolve) => {
      const done = (e) => {
        if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        if (e.target.closest?.('a')) return; // a link on the screen (the halted screen's About link)
        document.removeEventListener('keydown', done);
        document.removeEventListener('pointerdown', done);
        resolve();
      };
      setTimeout(() => {
        document.addEventListener('keydown', done);
        document.addEventListener('pointerdown', done);
      }, 250);
    });
  },

  // ---------- GRUB ----------
  grub(entries, title = 'GNU GRUB  version 2.12') {
    const menus = {
      main: [
        { label: 'TuxOS GNU/Linux', run: () => this.bootLog(false) },
        { label: 'Advanced options for TuxOS GNU/Linux', run: () => this.grub('advanced') },
        { label: 'Memory test (memtest86+)', run: () => this.memtest() },
        { label: 'UEFI Firmware Settings', run: () => this.firmware() },
      ],
      advanced: [
        { label: 'TuxOS GNU/Linux, with Linux 6.10.0-tuxos', run: () => this.bootLog(false) },
        { label: 'TuxOS GNU/Linux, with Linux 6.10.0-tuxos (recovery mode)', run: () => this.bootLog(true) },
        { label: '← Back', run: () => this.grub() },
      ],
    };
    const items = menus[entries || 'main'];
    let sel = 0;
    let countdown = entries ? null : (OS.state.username ? 3 : 5);
    const screen = this.show('grub');
    const { el } = OS.util;
    const list = el('ul', { class: 'grub-list', role: 'listbox', 'aria-label': 'Boot menu' });
    const foot = el('p', { class: 'grub-foot' });
    screen.append(el('div', { class: 'grub-frame' },
      el('p', { class: 'grub-title', text: title }), el('div', { class: 'grub-box' }, list), foot));

    const render = () => {
      list.innerHTML = '';
      items.forEach((it, i) => {
        const li = el('li', { class: i === sel ? 'sel' : '', role: 'option', 'aria-selected': String(i === sel), text: `${i === sel ? '*' : ' '}${it.label}` });
        list.append(li);
      });
      foot.textContent = 'Use the ↑ and ↓ keys to select which entry is highlighted.\nPress enter to boot the selected OS, \'e\' to edit the commands\nbefore booting or \'c\' for a command-line.' +
        (countdown != null ? `\nThe highlighted entry will be executed automatically in ${countdown}s.` : '');
    };
    const timer = countdown != null ? setInterval(() => {
      countdown--;
      if (countdown <= 0) choose(); else render();
    }, 1000) : null;
    const stopCountdown = () => { if (countdown != null) { countdown = null; clearInterval(timer); } };
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; stopCountdown(); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; stopCountdown(); render(); e.preventDefault(); }
      else if (e.key === 'Enter') choose();
      else if (e.key === 'e' || e.key === 'c') { stopCountdown(); foot.textContent = 'Nice try. In real GRUB this lets you edit kernel options. Here, just press Enter. 🙂'; }
    };
    const choose = () => {
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      items[sel].run();
    };
    document.addEventListener('keydown', onKey);
    render();
  },

  async memtest() {
    OS.achievements.unlock('memtest');
    const screen = this.show('memtest');
    const pre = OS.util.el('pre');
    screen.append(pre);
    const head = 'Memtest86+ v7.00      | Imaginary Penguin CPU @ 4.20GHz\nCLK/Temp: 4200MHz 42°C | Memory: 16GB  (it\'s a browser tab, so... sort of)\n\n';
    for (let p = 0; p <= 100; p += 4) {
      pre.textContent = `${head}Pass ${Math.min(1, Math.floor(p / 100))}  [${'#'.repeat(p / 4).padEnd(25, '.')}] ${p}%\nTest #${Math.floor(p / 15)} [Moving inversions, random pattern]\n\nErrors: 0`;
      await OS.util.sleep(OS.util.reducedMotion() ? 5 : 70);
    }
    pre.textContent += '\n\n** Pass complete, no errors. Your RAM is fine. **\nPress any key to return to GRUB.';
    await this.anyKey();
    this.grub();
  },

  async firmware() {
    const screen = this.show('memtest');
    screen.append(OS.util.el('pre', { text: 'UEFI Firmware Settings\n\nThis is a web browser. There is no firmware here. 🙂\n\nOn a real PC, this is where you would turn on "boot from USB"\nso you can try Linux from a USB stick.\n\nPress any key to return to GRUB.' }));
    await this.anyKey();
    this.grub();
  },

  // ---------- Kernel + systemd log ----------
  async bootLog(recovery) {
    if (recovery) OS.achievements.unlock('recovery');
    const screen = this.show('bootlog');
    const pre = OS.util.el('pre');
    screen.append(pre, OS.util.el('p', { class: 'boot-skip', text: 'Press any key to skip' }));
    let skip = false;
    const skipper = () => { skip = true; };
    document.addEventListener('keydown', skipper, { once: true });
    screen.addEventListener('pointerdown', skipper, { once: true });

    const kernel = [
      'Linux version 6.10.0-tuxos (tux@tuxos) (gcc 14.2.0) #1 SMP PREEMPT_DYNAMIC',
      `Command line: BOOT_IMAGE=/boot/vmlinuz-6.10-tuxos root=/dev/sda2 ro quiet splash${recovery ? ' single' : ''}`,
      'BIOS-provided physical RAM map:',
      'x86/fpu: Supporting XSAVE feature 0x001: \'x87 floating point registers\'',
      'Memory: 16318412K/16777216K available',
      'smp: Bringing up secondary CPUs ...',
      'smp: Brought up 1 node, 8 CPUs',
      'ACPI: Interpreter enabled',
      'PCI: Using host bridge windows from ACPI',
      'usb usb1: New USB device found, idVendor=1d6b, idProduct=0002',
      'EXT4-fs (sda2): mounted filesystem with ordered data mode',
      'Run /sbin/init as init process',
    ];
    const services = [
      'Mounted /boot/efi', 'Started Journal Service', 'Started udev Kernel Device Manager', 'Reached target Local File Systems',
      'Started Network Manager', 'Started Bluetooth service', 'Started OpenSSH server daemon', 'Started Regular background program processing daemon',
      recovery ? 'Started Recovery Mode Menu' : 'Started Penguin Hint Service', 'Started Segfault Daemon (suspicious)', 'Reached target Graphical Interface', 'Started GNOME Display Manager',
    ];
    let t = 0;
    for (const line of kernel) {
      t += Math.random() * 0.3;
      pre.innerHTML += `<span class="c-dim">[${t.toFixed(6).padStart(12)}]</span> ${OS.util.escape(line)}\n`;
      if (!skip) await OS.util.sleep(OS.util.reducedMotion() ? 0 : 60);
    }
    for (const s of services) {
      const warn = s.includes('suspicious');
      pre.innerHTML += `[<span class="${warn ? 'c-yellow' : 'c-green'}">${warn ? ' WARN ' : '  OK  '}</span>] ${OS.util.escape(s)}.\n`;
      screen.scrollTop = screen.scrollHeight;
      if (!skip) await OS.util.sleep(OS.util.reducedMotion() ? 0 : 110);
    }
    if (recovery) {
      pre.innerHTML += '\n<span class="c-yellow">Recovery Menu: nothing is broken, so resuming normal boot. 🩹</span>\n';
      if (!skip) await OS.util.sleep(1200);
    }
    if (!skip) await OS.util.sleep(300);
    document.removeEventListener('keydown', skipper);
    this.login();
  },

  // ---------- Login ----------
  // ---------- Login ----------
  // The steps and what they do live here. How they look comes from a greeter in js/greeters.js, picked
  // by the desktop environment last used, as on real distros: SDDM for KDE Plasma, GDM for GNOME,
  // dtlogin for CDE and tuigreet for Hyprland.
  //   users     the player saved in this browser (only GDM lists users; the others go to the password)
  //   password  a password for a user: checked by the server for online accounts, anything for guests
  //   username  "Not listed?": type a username, then a password
  //   create    make an online account (the default on a new device)
  //   guest     play without an account; progress stays in this browser
  login(mode, arg = {}, greeterId = { gnome: 'gdm', kde: 'sddm', retro: 'dtlogin', tiling: 'tuigreet' }[OS.state.theme] || 'sddm') {
    const greeter = OS.greeters[greeterId];
    const known = OS.state.username;
    const online = !!OS.state.online || OS.cloud.linked; // saves from before the flag existed only have the token
    mode = mode || (known ? 'users' : 'create');
    if (mode === 'users' && !greeter.userList) { mode = 'password'; arg = { name: known }; }

    this.stopLogin();
    const screen = this.show(`login greeter-${greeterId}`);
    const go = (next, nextArg = {}) => this.login(next, nextArg, greeterId);
    const start = (firstTime) => { this.stopLogin(); this.startSession(firstTime); };
    // Replacing a different player saved in this browser: ask first (a guest's progress exists nowhere else).
    const okToReplace = (name) => !known || known === name
      || confirm(online ? `This replaces ${known}'s progress in this browser. It's safe in their account.` : `This browser has progress for ${known}, who has no account, so it would be lost.\n\nTo keep it, log in as ${known} and create an account from Settings.\n\nContinue anyway?`);
    const toCreate = ['Create an account', () => go('create')];
    const toGuest = ['Play without an account', () => go('guest')];
    const toSignIn = ['I already have an account', () => go('username')];

    const steps = {
      users: () => ({
        users: [{ name: known, label: online ? 'Online account' : 'Guest: this browser only' }],
        pick: (name) => go('password', { name, back: 'users' }),
        links: [['Not listed?', () => go('username')]],
      }),

      password: () => {
        const { name } = arg;
        const local = name === known;
        const needsServer = !local || online;
        return {
          user: name,
          avatar: true,
          fields: [{ id: 'pass', label: 'Password', type: 'password' }],
          hint: needsServer ? 'No password reset here: if you forget it, the only way back in is a new account.' : 'Guest account: any password works.',
          back: arg.back ? () => go(arg.back) : null,
          links: arg.back ? [] : [['Log in as someone else', () => go('username')], toCreate, toGuest],
          async submit({ pass }, ui) {
            if (!needsServer) return start(false);
            if (!pass) return ui.error('Type your password.', 'pass');
            if (!local && !okToReplace(name)) return;
            ui.busy(true);
            const session = OS.state.theme;
            try {
              const data = await OS.cloud.login(name, pass);
              // Keep this browser's copy if it's newer than the account's (played offline, say); the next save syncs it.
              if (local && (OS.state.savedAt || 0) > (data.updatedAt || 0)) OS.cloud.schedule();
              else OS.loadState(data.save || { username: name }, data.updatedAt);
              // Start the session picked on the login screen, as a display manager does, if this account has it.
              if (OS.state.unlockedThemes.includes(session)) OS.state.theme = session;
              OS.state.username = name;
              OS.state.online = true;
              OS.save();
              OS.analytics.event('login');
              start(!data.save);
            } catch (err) {
              ui.busy(false);
              ui.clear('pass');
              ui.error(err.status === 401 ? "Sorry, that didn't work. Please try again." : err.message, 'pass');
            }
          },
        };
      },

      username: () => ({
        title: 'Log in',
        fields: [{ id: 'user', label: 'Username', type: 'text', value: arg.name }],
        hint: 'Log in to your online account to carry on where you left off.',
        back: known ? () => go('users') : null,
        links: [toCreate, toGuest],
        submit: ({ user }, ui) => {
          const problem = this.checkUsername(user);
          if (problem) return ui.error(problem, 'user');
          go('password', { name: user, back: 'username' });
        },
      }),

      create: () => ({
        title: 'Create an account',
        avatar: true,
        fields: [{ id: 'user', label: 'Username', type: 'text' }, { id: 'pass', label: 'Choose a password', type: 'password', autocomplete: 'new-password' }],
        hint: "No email needed. There's no password reset either, so pick a password you'll remember.",
        back: null,
        links: [toSignIn, toGuest, known ? [`Back to ${known}`, () => go('users')] : ['New here? What is Tuxplore?', () => { location.href = ctx.about; }]],
        async submit({ user, pass }, ui) {
          const problem = OS.boot.checkUsername(user);
          if (problem) return ui.error(problem, 'user');
          if (!pass) return ui.error('Choose a password.', 'pass');
          if (!okToReplace(user)) return;
          ui.busy(true);
          try {
            const fresh = { ...OS.defaultState(), username: user, theme: OS.state.theme, online: true };
            await OS.cloud.signup(user, pass, fresh);
            OS.loadState(fresh);
            OS.analytics.event('account_created');
            start(true);
          } catch (err) {
            ui.busy(false);
            ui.error(err.message, err.status === 409 ? 'user' : 'pass');
          }
        },
      }),

      guest: () => ({
        title: 'Play without an account',
        avatar: true,
        fields: [{ id: 'user', label: 'Pick a username', type: 'text' }],
        hint: 'Your progress stays in this browser only. You can create an account later in Settings.',
        back: null,
        links: [['Create an account instead', () => go('create')], toSignIn],
        submit: ({ user }, ui) => {
          const problem = this.checkUsername(user);
          if (problem) return ui.error(problem, 'user');
          if (!okToReplace(user)) return;
          OS.cloud.token = null;
          OS.loadState(OS.defaultState());
          OS.state.username = user;
          OS.save();
          OS.analytics.event('guest_started');
          start(true);
        },
      }),
    };

    // What every greeter can offer around the form: the clock, the power menu and the session picker.
    const ctx = {
      hostname: 'tuxos',
      about: 'about.html', // every greeter links here, for first-time visitors wondering what this is
      power: [['Restart', () => location.reload()], ['Shut Down', () => OS.boot.shutdown()]],
      sessions: OS.themes.filter((t) => OS.state.unlockedThemes.includes(t.id)).map((t) => ({
        name: t.name, active: t.id === OS.state.theme, pick: () => { OS.state.theme = t.id; OS.save(); go(mode, arg); },
      })),
      clock: (fn) => { fn(new Date()); this.loginTimers.push(setInterval(() => fn(new Date()), 1000)); },
      menu: (anchor, items, variant) => this.loginMenu(anchor, items, variant),
    };
    greeter.render(screen, { mode, ...steps[mode]() }, ctx);
  },

  stopLogin() {
    this.loginTimers.forEach(clearInterval);
    this.loginTimers = [];
    if (this.screen) this.screen.onkeydown = null;
    document.querySelector('.greeter-menu')?.remove();
  },

  // A small menu for the login screen: power, sessions, options. items: [label, fn] pairs or null for a line.
  loginMenu(anchor, items, variant = 'gdm') {
    const { el } = OS.util;
    document.querySelector('.greeter-menu')?.remove();
    const menu = el('div', { class: `greeter-menu menu-${variant}`, role: 'menu' }, items.map((item) => (item
      ? el('button', { role: 'menuitem', type: 'button', text: item[0], onclick: () => { menu.remove(); item[1](); } })
      : el('hr'))));
    this.screen.append(menu);
    const r = anchor.getBoundingClientRect();
    const h = menu.offsetHeight;
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 6 + h < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    menu.querySelector('button')?.focus();
    // Hand focus back to the form, so keyboard-driven greeters (tuigreet's F-keys) keep working.
    const refocus = () => (anchor.matches('button, input') ? anchor : this.screen.querySelector('input:not([disabled])'))?.focus();
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); menu.remove(); refocus(); } });
    setTimeout(() => document.addEventListener('pointerdown', function off(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); }
    }), 0);
  },

  checkUsername(user) {
    if (!/^[a-z_][a-z0-9_-]{0,15}$/.test(user)) return 'Use lowercase letters and numbers, starting with a letter (like "alex" or "sam_42").';
    if (user === 'root') return 'Logging in as root is a bad habit. Use a normal account and sudo when you need power.';
    return null;
  },

  startSession(firstTime) {
    this.screen.hidden = true;
    this.screen.innerHTML = '';
    OS.fs.init(OS.state.username);
    document.body.dataset.theme = OS.state.unlockedThemes.includes(OS.state.theme) ? OS.state.theme : 'kde';
    OS.wm.init();
    OS.applyWallpaper(OS.state.wallpaper);
    OS.tux.init();
    OS.quests.init();
    OS.tracks.init();
    OS.achievements.unlock('first_boot');

    const q = OS.quests.current();
    setTimeout(() => {
      if (firstTime) {
        OS.tux.say(`Hi ${OS.state.username}! I'm Tux. 🐧 Your quest journal is open. Start by opening the Terminal: press Ctrl+Alt+T, or ${OS.wm.de.openHow('Terminal')}.`, 14000);
        OS.wm.open('journal');
      } else if (q) {
        OS.tux.say(`Welcome back! Current quest: ${q.title}. Click me any time for a hint.`, 7000);
      } else {
        OS.tux.say('Welcome back, Linux graduate! 🎓', 5000);
      }
    }, 600);
  },

  // ---------- Crashes ----------
  async panic(reason = 'Attempted to kill init! exitcode=0x00000009') {
    const screen = this.show('panic');
    const pre = OS.util.el('pre');
    screen.append(pre);
    const doomed = ['/bin/ls', '/bin/bash', '/etc/passwd', '/usr/lib/libc.so.6', '/boot/vmlinuz-6.10-tuxos', '/home', '/sbin/init'];
    for (const f of doomed) {
      pre.textContent += `removed '${f}'\n`;
      await OS.util.sleep(OS.util.reducedMotion() ? 0 : 140);
    }
    pre.textContent += `\n[ 1337.000001] Kernel panic - not syncing: ${reason}\n[ 1337.000002] CPU: 0 PID: 1 Comm: init Tainted: G  D  6.10.0-tuxos\n[ 1337.000003] Call Trace:\n[ 1337.000004]  <TASK>\n[ 1337.000005]  dump_stack_lvl+0x48/0x70\n[ 1337.000006]  panic+0x2f5/0x320\n[ 1337.000007]  do_exit.cold+0x15/0x15\n[ 1337.000008]  </TASK>\n[ 1337.000009] ---[ end Kernel panic - not syncing ]---\n\n`;
    pre.append(OS.util.el('span', { class: 'panic-note', text: '🐧 Tux: Well, you deleted the whole operating system. On a real computer, that would be it: no undo.\n   Luckily this is a game. Press any key to reboot (your files are fine).' }));
    await this.anyKey();
    location.reload();
  },

  async shutdown() {
    const screen = this.show('bootlog');
    const pre = OS.util.el('pre');
    screen.append(pre);
    for (const s of ['Stopping User Manager for UID 1000', 'Stopped Network Manager', 'Stopped Segfault Daemon', 'Unmounted /home', 'Reached target System Power Off']) {
      pre.innerHTML += `[<span class="c-green">  OK  </span>] ${s}.\n`;
      await OS.util.sleep(OS.util.reducedMotion() ? 0 : 160);
    }
    await OS.util.sleep(300);
    this.show('halted', '<p>System halted.</p><p class="c-dim">Press any key to power on.</p><p class="halted-about"><a href="about.html">About Tuxplore</a></p>');
    document.getElementById('desktop').hidden = true;
    await this.anyKey();
    location.reload();
  },
};
