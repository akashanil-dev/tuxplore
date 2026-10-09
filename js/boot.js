'use strict';
// Boot flow: GRUB menu -> kernel/systemd log -> login screen -> desktop session.
// Also the kernel panic and shutdown screens.

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
  login() {
    const { el } = OS.util;
    const screen = this.show('login');
    const known = OS.state.username;
    const clock = el('div', { class: 'login-clock' });
    const tick = () => { clock.textContent = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
    tick();
    const clockTimer = setInterval(tick, 10000);
    const error = el('p', { class: 'login-error', role: 'alert' });
    const name = el('input', { class: 'login-input', type: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: '16', placeholder: 'username', 'aria-label': 'Username', value: known || '' });
    const pass = el('input', { class: 'login-input', type: 'password', placeholder: 'password (anything works)', 'aria-label': 'Password' });
    const go = el('button', { class: 'login-go', type: 'submit', text: known ? 'Log in' : 'Create account' });
    const form = el('form', { class: 'login-card' },
      el('div', { class: 'login-avatar', html: OS.tuxSvg() }),
      known ? el('h1', { text: known }) : el('h1', { text: 'Welcome to TuxOS' }),
      known ? null : el('p', { class: 'login-sub', text: 'Pick a username. Linux usernames are lowercase, with no spaces.' }),
      known ? null : name,
      pass, error, go);
    // Like GDM and SDDM: pick which desktop environment the session starts.
    const unlocked = OS.themes.filter((t) => OS.state.unlockedThemes.includes(t.id));
    if (unlocked.length > 1) {
      const current = () => (unlocked.find((t) => t.id === OS.state.theme) || unlocked[0]);
      const sessionBtn = el('button', { class: 'login-session', type: 'button', title: 'Choose a desktop environment' });
      const label = () => { sessionBtn.textContent = `⚙ ${current().name}`; };
      label();
      sessionBtn.addEventListener('click', () => {
        const r = sessionBtn.getBoundingClientRect();
        const menu = el('div', { class: 'popup-menu login-menu', role: 'menu' }, unlocked.map((t) => el('button', {
          role: 'menuitemradio', 'aria-checked': String(t.id === current().id), text: `${t.id === current().id ? '● ' : '○ '}${t.name}`,
          onclick: () => { OS.state.theme = t.id; OS.save(); label(); menu.remove(); },
        })));
        screen.append(menu);
        const h = menu.offsetHeight;
        menu.style.left = `${r.left}px`;
        menu.style.top = `${r.bottom + 6 + h < window.innerHeight ? r.bottom + 6 : r.top - h - 6}px`;
        setTimeout(() => document.addEventListener('pointerdown', function off(e) {
          if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); }
        }), 0);
      });
      form.append(sessionBtn);
    }
    screen.append(clock, form);
    (known ? pass : name).focus();

    name.addEventListener('input', () => { name.value = name.value.toLowerCase().replace(/\s/g, ''); error.textContent = ''; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = known || name.value.trim();
      if (!/^[a-z_][a-z0-9_-]{0,15}$/.test(user)) {
        error.textContent = 'Use lowercase letters and numbers, starting with a letter (like "alex" or "sam_42").';
        name.focus();
        return;
      }
      if (user === 'root') {
        error.textContent = 'Logging in as root is a bad habit. Use a normal account and sudo when you need power.';
        return;
      }
      clearInterval(clockTimer);
      OS.state.username = user;
      OS.save();
      this.startSession(!known);
    });
  },

  startSession(firstTime) {
    this.screen.hidden = true;
    this.screen.innerHTML = '';
    OS.fs.init(OS.state.username);
    document.body.dataset.theme = OS.state.unlockedThemes.includes(OS.state.theme) ? OS.state.theme : 'gnome';
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
