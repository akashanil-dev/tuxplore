'use strict';
// Boot flow: GRUB menu -> kernel/systemd log -> login screen -> desktop session.
// Also the kernel panic and shutdown screens.

// Icons for the login screen.
const ICONS = {
  a11y: '<svg viewBox="0 0 16 16"><circle cx="8" cy="2.8" r="1.3" fill="currentColor" stroke="none"/><path d="M2.5 5.5 8 6.6l5.5-1.1M8 6.6v3.4M8 10l-2.5 4.5M8 10l2.5 4.5"/></svg>',
  wifi: '<svg viewBox="0 0 16 16"><path d="M1.5 6a9.5 9.5 0 0 1 13 0M3.8 8.6a6.2 6.2 0 0 1 8.4 0M6.1 11.1a2.9 2.9 0 0 1 3.8 0"/><circle cx="8" cy="13.4" r=".9" fill="currentColor" stroke="none"/></svg>',
  volume: '<svg viewBox="0 0 16 16"><path d="M2 6h2.5L8 3v10l-3.5-3H2z" fill="currentColor" stroke="none"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.4 3.6a6.2 6.2 0 0 1 0 8.8"/></svg>',
  power: '<svg viewBox="0 0 16 16"><path d="M8 1.5v6"/><path d="M4.4 3.6a5.5 5.5 0 1 0 7.2 0"/></svg>',
  arrow: '<svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
  back: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

OS.boot = {
  screen: null,

  start() {
    this.screen = document.getElementById('boot');
    if (OS.state.fastBoot && OS.state.username) return this.login();
    this.grub();
  },

  show(cls, html = '') {
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
  // ---------- Login (styled after GDM, GNOME's login screen) ----------
  //   users     the player saved in this browser, plus "Not listed?"
  //   password  a password for a user: checked by the server for online accounts, anything for guests
  //   username  "Not listed?": type a username, then a password
  //   create    make an online account (the default on a new device)
  //   guest     play without an account; progress stays in this browser
  login(mode = OS.state.username ? 'users' : 'create', arg = {}) {
    const { el } = OS.util;
    const screen = this.show('login');
    const known = OS.state.username;
    const online = !!OS.state.online || OS.cloud.linked; // saves from before the flag existed only have the token
    const go = (next, nextArg) => { clearInterval(clockTimer); this.login(next, nextArg); };
    const start = (firstTime) => { clearInterval(clockTimer); this.startSession(firstTime); };

    // Top bar: clock in the middle, status icons and a power menu on the right.
    const clock = el('span', { class: 'gdm-clock' });
    const tick = () => { const d = new Date(); clock.textContent = `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}  ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`; };
    tick();
    const clockTimer = setInterval(tick, 10000);
    const power = el('button', { class: 'gdm-icons', type: 'button', 'aria-label': 'System menu', html: ICONS.a11y + ICONS.wifi + ICONS.volume + ICONS.power });
    power.addEventListener('click', () => this.loginMenu(power, [['Restart', () => location.reload()], ['Power Off', () => OS.boot.shutdown()]]));
    const main = el('form', { class: 'gdm-main', autocomplete: 'off' });
    screen.append(el('div', { class: 'gdm-bar' }, el('span'), clock, power), main);

    // Pieces every step is built from.
    const avatar = (size) => el('div', { class: `gdm-avatar ${size}`, html: OS.tuxSvg() });
    const msg = el('p', { class: 'gdm-msg', role: 'status' });
    const say = (text, isError) => { msg.textContent = text || ''; msg.classList.toggle('error', !!isError); };
    const link = (text, onclick) => el('button', { class: 'gdm-link', type: 'button', text, onclick });
    const field = (placeholder, type = 'text', withGo = true) => {
      const input = el('input', { type, placeholder, 'aria-label': placeholder, spellcheck: 'false', autocomplete: type === 'password' ? 'current-password' : 'username' });
      if (type === 'text') input.addEventListener('input', () => { input.value = input.value.toLowerCase().replace(/\s/g, ''); });
      const next = withGo ? el('button', { class: 'gdm-go', type: 'submit', 'aria-label': 'Next', html: ICONS.arrow }) : null;
      return { input, box: el('div', { class: 'gdm-entry' }, input, next), next };
    };
    const row = (back, entry) => el('div', { class: 'gdm-row' },
      back ? el('button', { class: 'gdm-back', type: 'button', 'aria-label': 'Back', html: ICONS.back, onclick: back }) : null, entry);
    const busy = (field, on) => { field.input.disabled = on; field.next?.classList.toggle('busy', on); };
    const checkName = (input) => {
      const problem = this.checkUsername(input.value.trim());
      if (problem) { say(problem, true); input.focus(); }
      return !problem;
    };
    // Replacing a different player saved in this browser: ask first (a guest's progress exists nowhere else).
    const okToReplace = (name) => !known || known === name
      || confirm(online ? `This replaces ${known}'s progress in this browser. It's safe in their account.` : `This browser has progress for ${known}, who has no account, so it would be lost.\n\nTo keep it, log in as ${known} and create an account from Settings.\n\nContinue anyway?`);

    if (mode === 'users') {
      main.append(
        el('button', { class: 'gdm-user', type: 'button', onclick: () => go('password', { name: known, back: 'users' }) },
          avatar('small'), el('span', {}, el('strong', { text: known }), el('small', { text: online ? 'Online account' : 'Guest: this browser only' }))),
        link('Not listed?', () => go('username')));
    }

    if (mode === 'password') {
      const { name } = arg;
      const local = name === known;
      const needsServer = !local || online;
      const pass = field('Password', 'password');
      main.append(avatar('big'), el('h1', { class: 'gdm-name', text: name }), row(arg.back ? () => go(arg.back) : null, pass.box), msg);
      say(needsServer ? 'No password reset here: if you forget it, the only way back in is a new account.' : 'Guest account: any password works.');
      pass.input.focus();
      main.onsubmit = async (e) => {
        e.preventDefault();
        if (!needsServer) return start(false);
        if (!pass.input.value) return say('Type your password.', true);
        if (!local && !okToReplace(name)) return;
        busy(pass, true);
        try {
          const data = await OS.cloud.login(name, pass.input.value);
          // Keep this browser's copy if it's newer than the account's (played offline, say); the next save syncs it.
          if (local && (OS.state.savedAt || 0) > (data.updatedAt || 0)) OS.cloud.schedule();
          else OS.loadState(data.save || { username: name }, data.updatedAt);
          OS.state.username = name;
          OS.state.online = true;
          OS.save();
          start(!data.save);
        } catch (err) {
          busy(pass, false);
          pass.input.value = '';
          pass.input.focus();
          say(err.status === 401 ? "Sorry, that didn't work. Please try again." : err.message, true);
        }
      };
    }

    if (mode === 'username') {
      const user = field('Username');
      main.append(el('h1', { class: 'gdm-title', text: 'Log in' }), row(known ? () => go('users') : null, user.box), msg,
        el('div', { class: 'gdm-links' }, link('Create an account', () => go('create')), link('Play without an account', () => go('guest'))));
      say('Log in to your online account to carry on where you left off.');
      if (arg.name) user.input.value = arg.name;
      user.input.focus();
      main.onsubmit = (e) => {
        e.preventDefault();
        if (checkName(user.input)) go('password', { name: user.input.value.trim(), back: 'username' });
      };
    }

    if (mode === 'create') {
      const user = field('Username', 'text', false);
      const pass = field('Choose a password', 'password');
      pass.input.autocomplete = 'new-password';
      main.append(avatar('big'), el('h1', { class: 'gdm-title', text: 'Create an account' }),
        row(null, user.box), row(null, pass.box), msg,
        el('div', { class: 'gdm-links' }, link('I already have an account', () => go('username')), link('Play without an account', () => go('guest')), known && link(`Back to ${known}`, () => go('users'))));
      say("No email needed. There's no password reset either, so pick a password you'll remember.");
      user.input.focus();
      main.onsubmit = async (e) => {
        e.preventDefault();
        if (!checkName(user.input)) return;
        if (!pass.input.value) { say('Choose a password.', true); pass.input.focus(); return; }
        const name = user.input.value.trim();
        if (!okToReplace(name)) return;
        busy(pass, true);
        try {
          const fresh = { ...OS.defaultState(), username: name, theme: OS.state.theme, online: true };
          await OS.cloud.signup(name, pass.input.value, fresh);
          OS.loadState(fresh);
          start(true);
        } catch (err) {
          busy(pass, false);
          say(err.message, true);
          (err.status === 409 ? user : pass).input.focus();
        }
      };
    }

    if (mode === 'guest') {
      const user = field('Pick a username');
      main.append(avatar('big'), el('h1', { class: 'gdm-title', text: 'Play without an account' }), row(null, user.box), msg,
        el('div', { class: 'gdm-links' }, link('Create an account instead', () => go('create'))));
      say('Your progress stays in this browser only. You can create an account later in Settings.');
      user.input.focus();
      main.onsubmit = (e) => {
        e.preventDefault();
        if (!checkName(user.input)) return;
        const name = user.input.value.trim();
        if (!okToReplace(name)) return;
        OS.cloud.token = null;
        OS.loadState(OS.defaultState());
        OS.state.username = name;
        OS.save();
        start(true);
      };
    }

    // GDM's session gear, bottom-right: pick which desktop environment the session starts.
    const unlocked = OS.themes.filter((t) => OS.state.unlockedThemes.includes(t.id));
    if (unlocked.length > 1 && mode !== 'users') {
      const gear = el('button', { class: 'gdm-session', type: 'button', title: 'Choose a desktop environment', 'aria-label': 'Choose a desktop environment', html: ICONS.gear });
      gear.addEventListener('click', () => this.loginMenu(gear, unlocked.map((t) => [`${t.id === OS.state.theme ? '● ' : '○ '}${t.name}`, () => { OS.state.theme = t.id; OS.save(); }])));
      screen.append(gear);
    }
  },

  // A small menu for the login screen's power button and session gear.
  loginMenu(anchor, items) {
    const { el } = OS.util;
    document.querySelector('.gdm-menu')?.remove();
    const menu = el('div', { class: 'gdm-menu', role: 'menu' }, items.map(([label, fn]) => el('button', { role: 'menuitem', type: 'button', text: label, onclick: () => { menu.remove(); fn(); } })));
    this.screen.append(menu);
    const r = anchor.getBoundingClientRect();
    const h = menu.offsetHeight;
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 6 + h < window.innerHeight ? r.bottom + 6 : r.top - h - 6}px`;
    menu.querySelector('button')?.focus();
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
    OS.achievements.unlock('first_boot');

    const q = OS.quests.current();
    setTimeout(() => {
      if (firstTime) {
        OS.tux.say(`Hi ${OS.state.username}! I'm Tux. 🐧 Your quest journal is open. Start by opening the Terminal: press Ctrl+Alt+T, or ${OS.wm.de.openHint}.`, 14000);
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
    this.show('halted', '<p>System halted.</p><p class="c-dim">Press any key to power on.</p>');
    document.getElementById('desktop').hidden = true;
    await this.anyKey();
    location.reload();
  },
};
