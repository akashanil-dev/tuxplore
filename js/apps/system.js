'use strict';
// Achievements, Settings and the "Try Linux" installer guide.

(() => {
  const { el } = OS.util;

  // ---------- Achievements ----------
  OS.registerApp('achievements', {
    title: 'Achievements',
    blurb: 'Trophies, including some secret ones',
    w: 640, h: 540,
    create(win) {
      const wrap = el('div', { class: 'ach' });
      win.body.append(wrap);
      const render = () => {
        const got = OS.achievements.list.filter((a) => OS.achievements.has(a.id)).length;
        wrap.innerHTML = '';
        wrap.append(el('p', { class: 'muted', text: `${got} of ${OS.achievements.list.length} unlocked. Secret ones show as ??? until you find them.` }));
        wrap.append(el('div', { class: 'ach-grid' }, OS.achievements.list.map((a) => {
          const has = OS.achievements.has(a.id);
          const secret = a.hidden && !has;
          return el('div', { class: `ach-item${has ? ' got' : ''}` },
            el('span', { class: 'ach-icon', text: secret ? '❓' : a.icon }),
            el('div', {}, el('strong', { text: secret ? '???' : a.name }), el('small', { text: secret ? 'A secret. Explore, poke around, misbehave a little.' : a.desc })));
        })));
      };
      OS.bus.on('achievement', render);
      win.onClose(() => OS.bus.off('achievement', render));
      render();
    },
  });

  // ---------- Settings: account ----------
  // Guests can move their progress into an online account (or log into one); logged-in players can sync or log out.
  const account = (rerender) => {
    const box = el('div', { class: 'account' });
    const error = el('p', { class: 'login-error account-error', role: 'alert' });
    const field = (attrs) => el('input', { class: 'account-input', spellcheck: 'false', ...attrs });

    if (OS.cloud.linked) {
      const synced = OS.cloud.lastSync ? new Date(OS.cloud.lastSync).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;
      box.append(el('h3', { text: 'Account' }),
        el('p', {}, '☁ Logged in as ', el('strong', { text: OS.state.username }), '. Your progress saves to your account automatically.'),
        synced && el('p', { class: 'muted', text: `Last synced at ${synced}.` }),
        el('div', { class: 'account-row' },
          el('button', { class: 'btn-ghost', text: 'Sync now', onclick: async (e) => { e.target.disabled = true; await OS.cloud.push(); rerender(); } }),
          el('button', { class: 'btn-ghost', text: 'Log out', onclick: async () => {
            if (!confirm('Log out on this device? Your progress stays safe in your account, and this browser goes back to the login screen.')) return;
            await OS.cloud.logout();
            OS.loadState(OS.defaultState());
            location.reload();
          } })));
      return box;
    }

    const name = field({ type: 'text', value: OS.state.username, maxlength: '16', 'aria-label': 'Username', autocomplete: 'username' });
    const pass = field({ type: 'password', placeholder: 'password', 'aria-label': 'Password', autocomplete: 'new-password' });
    name.addEventListener('input', () => { name.value = name.value.toLowerCase().replace(/\s/g, ''); });
    const create = el('button', { class: 'btn-primary', text: 'Create account' });
    create.addEventListener('click', async () => {
      const user = name.value.trim();
      error.textContent = OS.boot.checkUsername(user) || '';
      if (error.textContent) return;
      create.disabled = true;
      try {
        await OS.cloud.signup(user, pass.value, { ...OS.state, username: user, online: true });
        OS.state.online = true;
        OS.save();
        OS.analytics.event('account_created');
        if (user !== OS.state.username) {
          // The account got a different name: rename the player to match, and restart the session as them.
          OS.renameUser(user);
          await OS.cloud.push();
          location.reload();
          return;
        }
        OS.toast({ icon: '☁️', title: 'Account created', body: 'Your progress now saves online.' });
        rerender();
      } catch (err) {
        error.textContent = err.status === 409 ? `"${user}" is taken. Pick another name: your Linux username will change to match.` : err.message;
        create.disabled = false;
      }
    });

    const signIn = () => {
      const lname = field({ type: 'text', placeholder: 'username', maxlength: '16', 'aria-label': 'Username', autocomplete: 'username' });
      const lpass = field({ type: 'password', placeholder: 'password', 'aria-label': 'Password', autocomplete: 'current-password' });
      const go = el('button', { class: 'btn-primary', text: 'Log in' });
      go.addEventListener('click', async () => {
        if (!confirm('Logging in replaces the progress in this browser with the progress saved in that account. Continue?')) return;
        go.disabled = true;
        try {
          const data = await OS.cloud.login(lname.value.trim(), lpass.value);
          OS.loadState({ ...(data.save || {}), username: lname.value.trim(), online: true }, data.updatedAt);
          location.reload();
        } catch (err) {
          error.textContent = err.message;
          go.disabled = false;
        }
      });
      box.replaceChildren(el('h3', { text: 'Log in to your account' }), el('div', { class: 'account-row' }, lname, lpass, go), error,
        el('button', { class: 'login-link account-link', text: '← Back', onclick: rerender }));
      lname.focus();
    };

    box.append(el('h3', { text: 'Account' }),
      el('p', { class: 'muted', text: "You're playing without an account, so your progress lives only in this browser. Create one to keep it safe and play on other devices. There's no password reset, so pick a password you'll remember." }),
      el('div', { class: 'account-row' }, name, pass, create), error,
      el('button', { class: 'login-link account-link', text: 'I already have an account', onclick: signIn }));
    return box;
  };

  // ---------- Settings ----------
  OS.registerApp('settings', {
    title: 'Settings',
    blurb: 'Desktop environments, wallpapers and more',
    w: 680, h: 560,
    create(win) {
      const wrap = el('div', { class: 'settings' });
      win.body.append(wrap);
      // Like GNOME's and KDE's "About this system": the OS, then the game it lives in.
      const aboutSystem = () => {
        const de = OS.themes.find((t) => t.id === OS.state.theme);
        const link = (href, text) => el('a', { class: 'about-btn', href, target: '_blank', rel: 'noopener', text });
        return el('section', { class: 'about-system' },
          el('h3', { text: 'About this system' }),
          el('div', { class: 'about-head' },
            el('div', { class: 'about-logo', html: OS.tuxSvg() }),
            el('div', {}, el('strong', { text: 'TuxOS 1.0' }), el('span', { class: 'muted', text: 'Curious Penguin' }))),
          el('dl', { class: 'about-specs' },
            [['Desktop', de ? `${de.name} (${de.version})` : ''], ['Kernel', '6.10.0-tuxos'], ['Hostname', 'tuxos'],
              ['Quests', `${Object.keys(OS.state.quests.done).length} of ${OS.quests.list.length}`]]
              .flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
          el('p', { class: 'about-blurb' }, 'TuxOS is part of ', el('strong', { text: 'Tuxplore' }),
            ', a game that teaches Linux by letting you use it. Made by Akash A.'),
          el('div', { class: 'about-links' },
            link('about.html', 'About Tuxplore ↗'), link('stats.html', 'Public stats ↗'),
            link('https://github.com/akashanil-dev/tuxplore', 'Source code ↗')));
      };
      const render = () => {
        wrap.innerHTML = '';
        wrap.append(account(render));
        wrap.append(el('h3', { text: 'Desktop environment' }),
          el('p', { class: 'muted', text: 'A desktop environment is everything around your apps: panels, menus, window buttons and shortcuts. On Linux you pick the one you like, and the same apps run in all of them. Unlock more by finishing quests.' }),
          el('div', { class: 'theme-grid' }, OS.themes.map((t) => {
            const unlocked = OS.state.unlockedThemes.includes(t.id);
            const active = OS.state.theme === t.id;
            return el('button', {
              class: `theme-card${active ? ' active' : ''}${unlocked ? '' : ' locked'}`, 'aria-pressed': String(active), disabled: !unlocked,
              onclick: () => { if (active) return; OS.applyTheme(t.id); OS.analytics.event(`de_switch:${t.id}`); OS.achievements.unlock('theme_switch'); render(); },
            },
            el('span', { class: `theme-preview tp-${t.id}`, 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i')),
            el('strong', { text: `${unlocked ? '' : '🔒 '}${t.name}` }),
            el('small', { text: unlocked ? t.desc : t.unlock }),
            unlocked && el('small', { class: 'theme-used', text: `Used by ${t.usedBy}` }));
          })),
          el('h3', { text: 'Wallpaper' }),
          el('div', { class: 'wall-grid' }, Object.entries(OS.wallpapers).map(([id, name]) => el('button', {
            class: `wall${OS.state.wallpaper === id ? ' active' : ''}`, 'aria-label': `Wallpaper: ${name}`, 'aria-pressed': String(OS.state.wallpaper === id),
            style: { background: `url('${OS.wallpaperUrl(id, true)}') center / cover no-repeat` }, onclick: () => { OS.applyWallpaper(id); render(); },
          }, el('span', { text: name })))),
          el('h3', { text: 'System' }),
          el('label', { class: 'toggle' },
            el('input', { type: 'checkbox', checked: OS.state.fastBoot, onchange: (e) => { OS.state.fastBoot = e.target.checked; OS.save(); } }),
            ' Skip GRUB and the boot log on startup'),
          el('label', { class: 'toggle' },
            el('input', { type: 'checkbox', checked: !OS.analytics.optedOut, onchange: (e) => { OS.analytics.optedOut = !e.target.checked; } }),
            ' Share anonymous usage counts'),
          el('p', { class: 'muted settings-note' }, 'Counts like "someone finished a quest" help improve Tuxplore. Never who you are: no cookies, no IDs. ',
            el('a', { href: 'stats.html', target: '_blank', rel: 'noopener', text: 'See everything that\'s collected' }), '.'),
          el('div', { class: 'danger' },
            el('div', {}, el('strong', { text: 'Reset the filesystem' }), el('small', { text: 'Restores every file to how it started. Quest progress stays.' })),
            el('button', { class: 'btn-ghost', text: 'Reset files', onclick: () => {
              if (confirm('Restore every file to how it started?')) { OS.fs.reset(); OS.toast({ icon: '🧹', title: 'Filesystem restored' }); }
            } })),
          el('div', { class: 'danger' },
            el('div', {}, el('strong', { text: 'Start over' }), el('small', { text: OS.cloud.linked ? 'Erase your progress, achievements and files. You keep your account and username.' : 'Erase your progress, achievements and files.' })),
            el('button', { class: 'btn-danger', text: 'Reset everything', onclick: () => {
              if (confirm('Erase everything and start from scratch?')) OS.resetSave();
            } })),
          aboutSystem());
      };
      render();
    },
  });

  // ---------- Try Linux ----------
  const DISTROS = {
    mint: { name: 'Linux Mint', url: 'https://linuxmint.com', why: 'Feels familiar if you come from Windows. Calm, stable, everything works out of the box.', family: 'Debian / Ubuntu' },
    ubuntu: { name: 'Ubuntu', url: 'https://ubuntu.com/desktop', why: 'The most popular desktop Linux. Huge community, so every question has an answer online.', family: 'Debian' },
    fedora: { name: 'Fedora', url: 'https://fedoraproject.org/workstation/', why: 'Modern, polished and up to date. Loved by developers. Pure GNOME desktop.', family: 'Red Hat' },
    pop: { name: 'Pop!_OS', url: 'https://pop.system76.com', why: 'Great for gaming and NVIDIA graphics cards. Built-in window tiling.', family: 'Debian / Ubuntu' },
    endeavour: { name: 'EndeavourOS', url: 'https://endeavouros.com', why: 'Arch Linux with a friendly installer. Rolling releases, latest everything, and the famous Arch Wiki.', family: 'Arch' },
    debian: { name: 'Debian', url: 'https://www.debian.org', why: 'Rock solid and 100% community run. Runs well on older computers.', family: 'Debian' },
  };
  const QUIZ = [
    { q: 'How do you like your computer?', a: [['It should just work', { mint: 2, ubuntu: 1 }], ['I like tweaking a bit', { fedora: 2, pop: 1 }], ['I want to understand and control everything', { endeavour: 3, debian: 1 }]] },
    { q: 'What will you mostly do?', a: [['Web, school, office work', { mint: 2, ubuntu: 1 }], ['Gaming', { pop: 3, endeavour: 1 }], ['Programming', { fedora: 2, ubuntu: 1 }], ['Revive an old computer', { debian: 3, mint: 1 }]] },
    { q: 'What do you use right now?', a: [['Windows', { mint: 2, pop: 1 }], ['macOS', { fedora: 2, ubuntu: 1 }], ['Something else / nothing', { ubuntu: 1, debian: 1 }]] },
    { q: 'Updates: newest features or maximum stability?', a: [['Newest, always', { fedora: 2, endeavour: 2 }], ['Balanced', { ubuntu: 1, pop: 1 }], ['Stable and boring is good', { debian: 2, mint: 2 }]] },
  ];

  OS.registerApp('install', {
    title: 'Try Linux',
    blurb: 'Find your distro and try the real thing',
    w: 720, h: 600,
    locked: () => !OS.state.quests.done.packages,
    lockedMsg: 'Finish quest 9 (The App Store) to unlock it.',
    create(win) {
      const wrap = el('div', { class: 'install' });
      win.body.append(wrap);
      let step = 0;
      let scores = {};

      const journey = () => el('div', { class: 'journey' },
        [['Commands learned', Object.keys(OS.state.learned).length], ['Quests', `${Object.keys(OS.state.quests.done).length}/${OS.quests.list.length}`], ['Achievements', Object.keys(OS.state.achievements).length], ['Pipe Dream', `${Object.keys(OS.state.pipe.solved).length}/${OS.pipeLevels.length}`]]
          .map(([k, v]) => el('div', { class: 'stat' }, el('strong', { text: String(v) }), el('small', { text: k }))));

      const render = () => {
        wrap.innerHTML = '';
        if (step === 0) {
          wrap.append(el('h2', { text: 'You are ready for real Linux 🎓' }), journey(),
            el('p', { text: 'Everything you practised here works the same on a real Linux computer: the commands, the folders, sudo, package managers, pipes.' }),
            el('p', { text: 'Answer 4 quick questions and I\'ll suggest a distro to start with.' }),
            el('button', { class: 'btn-primary', text: 'Find my distro →', onclick: () => { step = 1; scores = {}; render(); } }));
          return;
        }
        if (step <= QUIZ.length) {
          const item = QUIZ[step - 1];
          wrap.append(el('p', { class: 'muted', text: `Question ${step} of ${QUIZ.length}` }), el('h2', { text: item.q }),
            el('div', { class: 'quiz' }, item.a.map(([label, pts]) => el('button', {
              class: 'quiz-opt', text: label,
              onclick: () => { for (const [k, v] of Object.entries(pts)) scores[k] = (scores[k] || 0) + v; step++; render(); },
            }))));
          return;
        }
        const [bestId] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        const d = DISTROS[bestId];
        OS.analytics.event(`distro_match:${bestId}`);
        OS.achievements.unlock('installer');
        wrap.append(
          el('p', { class: 'muted', text: 'Your match' }),
          el('div', { class: 'distro-card' }, el('h2', { text: d.name }), el('p', { text: d.why }), el('small', { text: `Family: ${d.family}` }),
            el('a', { class: 'btn-primary', href: d.url, target: '_blank', rel: 'noopener', text: `Visit ${d.name} ↗` })),
          el('h3', { text: 'How to try it without changing anything' }),
          el('ol', { class: 'steps' },
            el('li', {}, el('strong', { text: 'Download the ISO. ' }), `This is the installer image, from ${d.name}'s official website.`),
            el('li', {}, el('strong', { text: 'Flash a USB stick (8 GB+). ' }), 'Use ', el('a', { href: 'https://etcher.balena.io', target: '_blank', rel: 'noopener', text: 'balenaEtcher' }), ', ', el('a', { href: 'https://www.ventoy.net', target: '_blank', rel: 'noopener', text: 'Ventoy' }), ' or ', el('a', { href: 'https://rufus.ie', target: '_blank', rel: 'noopener', text: 'Rufus' }), '. This erases the USB stick.'),
            el('li', {}, el('strong', { text: 'Boot from the USB. ' }), 'Restart and press the boot-menu key (often F12, F2, Esc or Del) to pick the USB. Remember GRUB? You will see it here.'),
            el('li', {}, el('strong', { text: 'Play in the live session. ' }), 'Linux runs straight from the USB. Nothing on your computer changes until you choose "Install".'),
            el('li', {}, el('strong', { text: 'Install, or dual boot. ' }), 'The installer can put Linux next to Windows so you can pick at startup. Back up your files first!')),
          el('p', { class: 'muted' }, 'Prefer not to touch your PC yet? Run it in a virtual machine with ', el('a', { href: 'https://www.virtualbox.org', target: '_blank', rel: 'noopener', text: 'VirtualBox' }), ' or GNOME Boxes.'),
          el('button', { class: 'btn-ghost', text: '↺ Retake the quiz', onclick: () => { step = 1; scores = {}; render(); } }));
      };
      render();
    },
  });
})();
