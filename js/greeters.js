'use strict';
// Login screens ("greeters"). Each one draws the same login steps from OS.boot.login() in the style of
// a real Linux display manager, and hands the form back through a small ui object:
//   ui.say(text, isError)   message under the form
//   ui.error(text, fieldId) an error, with that field focused
//   ui.busy(on)             while the server checks the password
//   ui.clear(fieldId)
//
// A step has: title or user, avatar, fields [{id, label, type, value}], hint, back, links [[label, fn]],
// submit(values, ui); or users [{name, label}] with pick(name) when GDM lists them.

(() => {
  const { el } = OS.util;

  const ICONS = {
    a11y: '<svg viewBox="0 0 16 16"><circle cx="8" cy="2.8" r="1.3" fill="currentColor" stroke="none"/><path d="M2.5 5.5 8 6.6l5.5-1.1M8 6.6v3.4M8 10l-2.5 4.5M8 10l2.5 4.5"/></svg>',
    wifi: '<svg viewBox="0 0 16 16"><path d="M1.5 6a9.5 9.5 0 0 1 13 0M3.8 8.6a6.2 6.2 0 0 1 8.4 0M6.1 11.1a2.9 2.9 0 0 1 3.8 0"/><circle cx="8" cy="13.4" r=".9" fill="currentColor" stroke="none"/></svg>',
    volume: '<svg viewBox="0 0 16 16"><path d="M2 6h2.5L8 3v10l-3.5-3H2z" fill="currentColor" stroke="none"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.4 3.6a6.2 6.2 0 0 1 0 8.8"/></svg>',
    power: '<svg viewBox="0 0 16 16"><path d="M8 1.5v6"/><path d="M4.4 3.6a5.5 5.5 0 1 0 7.2 0"/></svg>',
    restart: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M12 1.5v3h-3"/></svg>',
    arrow: '<svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
    back: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  };

  // ---------- Shared pieces ----------

  const makeInput = (field) => {
    const input = el('input', {
      type: field.type, 'aria-label': field.label, spellcheck: 'false',
      autocomplete: field.autocomplete || (field.type === 'password' ? 'current-password' : 'username'),
    });
    if (field.value) input.value = field.value;
    // Linux usernames: lowercase, no spaces.
    if (field.type === 'text') input.addEventListener('input', () => { input.value = input.value.toLowerCase().replace(/\s/g, ''); });
    return input;
  };

  // The ui object a step's submit() talks to. busyFn shows the greeter's own "working" state.
  const makeUi = (msg, inputs, busyFn) => {
    const ui = {
      say(text, isError) { msg.textContent = text || ''; msg.classList.toggle('error', !!isError); },
      error(text, id) { ui.say(text, true); inputs[id]?.focus(); },
      busy(on) { Object.values(inputs).forEach((i) => { i.disabled = on; }); busyFn?.(on); if (!on) Object.values(inputs).at(-1)?.focus(); },
      clear(id) { if (inputs[id]) inputs[id].value = ''; },
    };
    return ui;
  };

  const values = (inputs) => ({ user: inputs.user?.value.trim(), pass: inputs.pass?.value });

  // Enter in an earlier field moves to the next one; in the last, it submits.
  const chainFields = (step, inputs, submit) => {
    const list = step.fields.map((f) => inputs[f.id]);
    list.forEach((input, i) => input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (i < list.length - 1) list[i + 1].focus(); else submit();
    }));
  };

  const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  OS.greeters = {
    // ---------- GDM (GNOME) ----------
    gdm: {
      userList: true,
      render(screen, step, ctx) {
        const clock = el('span', { class: 'gdm-clock' });
        ctx.clock((d) => { clock.textContent = `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}  ${fmtTime(d)}`; });
        const power = el('button', { class: 'gdm-icons', type: 'button', 'aria-label': 'System menu', html: ICONS.a11y + ICONS.wifi + ICONS.volume + ICONS.power });
        power.addEventListener('click', () => ctx.menu(power, ctx.power));
        const main = el('form', { class: 'gdm-main', autocomplete: 'off' });
        screen.append(el('div', { class: 'gdm-bar' }, el('span'), clock, power), main);
        const avatar = (size) => el('div', { class: `gdm-avatar ${size}`, html: OS.tuxSvg() });
        const links = () => el('div', { class: 'gdm-links' }, step.links.map(([label, fn]) => el('button', { class: 'gdm-link', type: 'button', text: label, onclick: fn })));

        if (step.users) {
          main.append(...step.users.map((u) => el('button', { class: 'gdm-user', type: 'button', onclick: () => step.pick(u.name) },
            avatar('small'), el('span', {}, el('strong', { text: u.name }), el('small', { text: u.label })))), links());
          main.querySelector('.gdm-user').focus();
          return;
        }

        const inputs = {};
        const go = el('button', { class: 'gdm-go', type: 'submit', 'aria-label': 'Next', html: ICONS.arrow });
        const msg = el('p', { class: 'gdm-msg', role: 'status' });
        const ui = makeUi(msg, inputs, (on) => go.classList.toggle('busy', on));
        if (step.avatar) main.append(avatar('big'));
        main.append(el('h1', { class: step.user ? 'gdm-name' : 'gdm-title', text: step.user || step.title }));
        step.fields.forEach((f, i) => {
          const input = makeInput(f);
          input.placeholder = f.label;
          inputs[f.id] = input;
          const last = i === step.fields.length - 1;
          main.append(el('div', { class: 'gdm-row' },
            i === 0 && step.back ? el('button', { class: 'gdm-back', type: 'button', 'aria-label': 'Back', html: ICONS.back, onclick: step.back }) : null,
            el('div', { class: 'gdm-entry' }, input, last ? go : null)));
        });
        main.append(msg);
        if (step.links.length) main.append(links());
        ui.say(step.hint);
        chainFields(step, inputs, () => step.submit(values(inputs), ui));
        main.onsubmit = (e) => { e.preventDefault(); step.submit(values(inputs), ui); };
        inputs[step.fields[0].id].focus();

        // GDM's session gear sits in the bottom-right corner.
        if (ctx.sessions.length > 1) {
          const gear = el('button', { class: 'gdm-session', type: 'button', 'aria-label': 'Choose a desktop environment', title: 'Choose a desktop environment', html: ICONS.gear });
          gear.addEventListener('click', () => ctx.menu(gear, ctx.sessions.map((s) => [`${s.active ? '● ' : '○ '}${s.name}`, s.pick])));
          screen.append(gear);
        }
      },
    },

    // ---------- SDDM with the Breeze theme (KDE Plasma) ----------
    sddm: {
      render(screen, step, ctx) {
        const time = el('div', { class: 'sddm-time' });
        const date = el('div', { class: 'sddm-date' });
        ctx.clock((d) => { time.textContent = fmtTime(d); date.textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); });
        const inputs = {};
        const go = el('button', { class: 'sddm-go', type: 'submit', 'aria-label': 'Log in', html: ICONS.arrow });
        const msg = el('p', { class: 'sddm-msg', role: 'status' });
        const ui = makeUi(msg, inputs, (on) => go.classList.toggle('busy', on));
        const form = el('form', { class: 'sddm-form', autocomplete: 'off' },
          el('div', { class: 'sddm-avatar', html: OS.tuxSvg() }),
          el('div', { class: 'sddm-name', text: step.user || step.title }));
        step.fields.forEach((f, i) => {
          const input = makeInput(f);
          input.placeholder = f.label;
          inputs[f.id] = input;
          form.append(el('div', { class: 'sddm-row' }, input, i === step.fields.length - 1 ? go : null));
        });
        form.append(msg);
        if (step.back || step.links.length) {
          form.append(el('div', { class: 'sddm-links' },
            step.back ? el('button', { type: 'button', text: '‹ Back', onclick: step.back }) : null,
            step.links.map(([label, fn]) => el('button', { type: 'button', text: label, onclick: fn }))));
        }
        ui.say(step.hint);
        chainFields(step, inputs, () => step.submit(values(inputs), ui));
        form.onsubmit = (e) => { e.preventDefault(); step.submit(values(inputs), ui); };

        // Big round action buttons along the bottom, the session picker in the bottom-left corner.
        const actions = el('div', { class: 'sddm-actions' }, ctx.power.map(([label, fn]) => el('button', { type: 'button', onclick: fn },
          el('span', { class: 'sddm-action-icon', html: label === 'Restart' ? ICONS.restart : ICONS.power }), el('span', { text: label }))));
        const active = ctx.sessions.find((s) => s.active);
        const session = el('button', { class: 'sddm-session', type: 'button', text: `Desktop Session: ${active?.name || 'Plasma'} ▾` });
        session.addEventListener('click', () => ctx.menu(session, ctx.sessions.map((s) => [`${s.active ? '● ' : '○ '}${s.name}`, s.pick]), 'sddm'));
        screen.append(el('div', { class: 'sddm-clock' }, time, date), form, actions,
          el('div', { class: 'sddm-bottom' }, session, el('span', { class: 'sddm-kbd', text: 'Keyboard Layout: US' })));
        inputs[step.fields[0].id].focus();
      },
    },

    // ---------- dtlogin (CDE) ----------
    // One prompt at a time, OK / Start Over / Options / Help, like the Solaris and HP-UX login box.
    dtlogin: {
      render(screen, step, ctx) {
        let index = 0;
        const inputs = {};
        const label = el('p', { class: 'dt-label' });
        const slot = el('div', { class: 'dt-slot' });
        const msg = el('p', { class: 'dt-msg', role: 'status' });
        const ok = el('button', { type: 'submit', text: 'OK' });
        const ui = makeUi(msg, inputs, (on) => { ok.disabled = on; screen.classList.toggle('dt-busy', on); });
        const prompt = (f) => (f.type === 'password' ? `Please enter your ${f.label === 'Password' ? 'password' : 'new password'}` : `Please enter your ${f.label === 'Username' ? 'user name' : 'new user name'}`);
        const show = () => {
          const f = step.fields[index];
          inputs[f.id] = inputs[f.id] || makeInput(f);
          label.textContent = prompt(f);
          slot.replaceChildren(inputs[f.id]);
          inputs[f.id].focus();
        };
        const form = el('form', { class: 'dt-form', autocomplete: 'off' });
        form.onsubmit = (e) => {
          e.preventDefault();
          if (index < step.fields.length - 1) { index++; show(); return; }
          step.submit(values(inputs), ui);
        };
        // Start Over: back to the previous screen, or the first prompt.
        const startOver = () => { if (step.back) return step.back(); index = 0; Object.values(inputs).forEach((i) => { i.value = ''; }); ui.say(step.hint); show(); };
        const options = el('button', { type: 'button', text: 'Options' });
        options.addEventListener('click', () => ctx.menu(options, [
          ...step.links,
          null,
          ...ctx.sessions.map((s) => [`Session: ${s.name}${s.active ? '  ✓' : ''}`, s.pick]),
          null,
          ['Reset Login Screen', () => location.reload()],
          ['Shut Down', () => OS.boot.shutdown()],
        ].filter((item, i, all) => !(item === null && (i === 0 || all[i - 1] === null))), 'dtlogin'));
        const help = el('button', { type: 'button', text: 'Help' });
        help.addEventListener('click', () => {
          const box = el('div', { class: 'dt-help', role: 'dialog' },
            el('p', { text: step.hint || '' }),
            el('p', { text: 'Use Options to create an account, play without one, or pick a different desktop session.' }),
            el('button', { type: 'button', text: 'OK', onclick: () => { box.remove(); help.focus(); } }));
          screen.append(box);
          box.querySelector('button').focus();
        });
        const greeting = step.user ? `Welcome ${step.user}` : step.title === 'Log in' ? `Welcome to ${ctx.hostname}` : step.title;
        form.append(
          el('div', { class: 'dt-body' },
            el('div', { class: 'dt-logo' }, el('div', { class: 'dt-tux', html: OS.tuxSvg() }), el('strong', { text: 'TuxOS' }), el('small', { text: 'Common Desktop Environment' })),
            el('div', { class: 'dt-main' }, el('h1', { text: greeting }), label, slot, msg)),
          el('div', { class: 'dt-buttons' }, ok, el('button', { type: 'button', text: 'Start Over', onclick: startOver }), options, help));
        screen.append(form);
        ui.say(step.hint);
        show();
      },
    },

    // ---------- tuigreet (Hyprland) ----------
    // A text-mode greeter in a box, driven by the keyboard. The key hints at the bottom are clickable too.
    tuigreet: {
      render(screen, step, ctx) {
        const now = el('div', { class: 'tui-time' });
        ctx.clock((d) => { now.textContent = `${d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; });
        const inputs = {};
        const msg = el('p', { class: 'tui-msg', role: 'status' });
        const ui = makeUi(msg, inputs, (on) => { if (on) msg.textContent = 'Authenticating...'; });
        const form = el('form', { class: 'tui-box', autocomplete: 'off' },
          el('span', { class: 'tui-title', text: ` Authenticate into ${ctx.hostname} ` }),
          el('p', { class: 'tui-greet', text: step.user ? `Welcome back, ${step.user}` : step.title === 'Log in' ? 'Welcome to TuxOS' : step.title }));
        if (step.user) form.append(el('p', { class: 'tui-line' }, el('span', { class: 'tui-key', text: 'Username:' }), el('span', { text: step.user })));
        step.fields.forEach((f) => {
          const input = makeInput(f);
          inputs[f.id] = input;
          form.append(el('label', { class: 'tui-line' }, el('span', { class: 'tui-key', text: `${f.label}:` }), input));
        });
        form.append(msg);
        ui.say(step.hint);
        chainFields(step, inputs, () => step.submit(values(inputs), ui));
        form.onsubmit = (e) => { e.preventDefault(); step.submit(values(inputs), ui); };

        const active = ctx.sessions.find((s) => s.active);
        const key = (k, text, fn) => (fn ? el('button', { type: 'button', class: 'tui-hint', onclick: fn }, el('b', { text: k }), ` ${text}`) : null);
        const accounts = step.links.length ? () => ctx.menu(bar, step.links, 'tui') : null;
        const sessions = ctx.sessions.length > 1 ? () => ctx.menu(bar, ctx.sessions.map((s) => [`${s.active ? '(*)' : '( )'} ${s.name}`, s.pick]), 'tui') : null;
        const power = () => ctx.menu(bar, ctx.power, 'tui');
        const bar = el('div', { class: 'tui-bar' },
          key('ESC', 'Back', step.back), key('F2', 'Accounts', accounts), key('F3', 'Change session', sessions), key('F12', 'Power', power),
          el('span', { class: 'tui-session', text: `Session: ${active?.name || 'Hyprland'}` }));
        screen.onkeydown = (e) => {
          const actions = { Escape: step.back, F2: accounts, F3: sessions, F12: power };
          if (actions[e.key] && !document.querySelector('.greeter-menu')) { e.preventDefault(); actions[e.key](); }
        };
        screen.append(now, form, bar);
        inputs[step.fields[0].id].focus();
      },
    },
  };
})();
