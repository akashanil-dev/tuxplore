'use strict';
// Tux Runner: "Know Your Distro" (https://github.com/akashanil-dev/know-your-distro), rebuilt inside TuxOS.
//
// Pick a team (a distro family). Distro tiles slide toward Tux: run into your team's distros for
// +50, and every wrong one costs -20 and a life. Two modes:
//   Rapid    - three teams, 10 lives each, scores summed; ends on a finish screen (made for events).
//   Infinite - endless; switch teams any time; the best total is remembered.
// The game starts slow and speeds up as your score grows (up to 2x).
//
// World units are CSS pixels times a small zoom. Scenery is pre-rendered into seamless strips so
// every frame costs the same, which keeps motion smooth.

(() => {
  const { el } = OS.util;

  // ---------- Game rules (from the original) ----------
  // The original 14, plus more members for every family.
  const TEAMS = {
    Debian: ['Ubuntu', 'Kali', 'ParrotOS', 'Debian', 'Linux Mint', 'Pop!_OS', 'MX Linux', 'Zorin OS', 'elementary OS', 'Kubuntu', 'Raspberry Pi OS', 'Deepin', 'Tails'],
    'Red Hat': ['Fedora', 'CentOS', 'AlmaLinux', 'RHEL', 'Rocky Linux', 'Oracle Linux'],
    Arch: ['Arch', 'Manjaro', 'EndeavourOS', 'BlackArch', 'ArcoLinux', 'Artix', 'SteamOS'],
    Slackware: ['Slackware', 'Salix OS', 'Absolute Linux'],
    Gentoo: ['Gentoo', 'Funtoo', 'Calculate Linux'],
  };
  const TEAM_NAMES = Object.keys(TEAMS);
  const ICONS = {
    Debian: 'debian', Ubuntu: 'ubuntu', Kali: 'kali', ParrotOS: 'parrotos',
    'Red Hat': 'red_hat', Fedora: 'fedora', CentOS: 'centos', AlmaLinux: 'almalinux',
    Arch: 'arch', Manjaro: 'manjaro', EndeavourOS: 'endeavouros',
    Slackware: 'slackware', 'Salix OS': 'salixos', Gentoo: 'gentoo', Funtoo: 'funtoo',
    'Linux Mint': 'mint', 'Pop!_OS': 'popos', 'MX Linux': 'mx', 'Zorin OS': 'zorin', 'elementary OS': 'elementary',
    Kubuntu: 'kubuntu', 'Raspberry Pi OS': 'raspios', Deepin: 'deepin', Tails: 'tails',
    RHEL: 'red_hat', 'Rocky Linux': 'rocky', 'Oracle Linux': 'oracle',
    BlackArch: 'blackarch', ArcoLinux: 'arcolinux', Artix: 'artix', SteamOS: 'steamos',
    'Absolute Linux': 'absolute', 'Calculate Linux': 'calculate',
  };
  const OWN_TEAM_SHARE = 0.45; // at least 40% of tiles come from the player's team
  const TEAM_COLOR = { Debian: '#d70a53', 'Red Hat': '#ee0000', Arch: '#1793d1', Slackware: '#4b5ea8', Gentoo: '#7a6bb0' };
  const SCORE_GOOD = 50;
  const SCORE_BAD = -20;
  const LIVES_PER_TEAM = 10;
  const RAPID_ROUNDS = 3;

  // ---------- Feel ----------
  const BASE_SPEED = 170;          // world units per second at the start: deliberately slow
  const JUMP_V = -620;
  const MAX_AIR_JUMPS = 3;         // extra jumps while airborne, as in the original
  const AIR_JUMP_SCALE = 0.7;
  const WALK_SPEED = 190;          // A/D walking, on the ground only
  const TILE = 60;                 // every distro tile is the same TILE x TILE square
  const TUX_SCALE = 1.2;           // penguin drawn (and collides) 20% larger
  const GRAVITY = 1840;            // 20% lighter than before (2300)
  const GRAVITY_HELD = 1040;       // while the jump key is held on the way up (was 1300)
  // Short tile labels for the few names too long for a tile; full names are used everywhere else.
  const TILE_LABEL = { 'Raspberry Pi OS': 'Raspberry Pi', 'Calculate Linux': 'Calculate', 'Absolute Linux': 'Absolute', 'elementary OS': 'elementary', 'Oracle Linux': 'Oracle' };
  const GAP_BASE = 330;            // distance between tile groups
  const GAP_RANGE = 170;
  const PAIR_GAP = 190;            // gap inside a pair, wide enough to land between
  const DAY_LEN = 16000;           // distance for one dawn → night → dawn cycle
  const WEATHER_EVERY = 20;        // seconds
  const ICON_DIR = 'images/distros/';

  // Speed ramp from the original: nothing until 50 points, +0.1% per point to 100, then +0.2% per
  // point, capped at 2x. Based on the current team's score, so each round starts slow again.
  function speedMultiplier(score) {
    let m = 1;
    if (score > 50) m += 0.001 * Math.min(score - 50, 50);
    if (score > 100) m += 0.002 * (score - 100);
    return Math.min(2, m);
  }

  const teamOf = (distro) => TEAM_NAMES.find((t) => TEAMS[t].includes(distro));

  const images = {};
  function iconImage(name) {
    const file = ICONS[name];
    if (!images[file]) { images[file] = new Image(); images[file].src = `${ICON_DIR}${file}.png`; }
    return images[file];
  }
  Object.keys(ICONS).forEach(iconImage);

  const icon = (name, size = 22) => el('img', { class: 'kd-icon', src: `${ICON_DIR}${ICONS[name]}.png`, alt: '', width: size, height: size, style: { width: `${size}px`, height: `${size}px` } });

  // ---------- Colour helpers ----------
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (c) => (c.startsWith('#') ? c : `#${c.match(/\d+/g).slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`);
  const mix = (a, b, t) => { const A = hex(toHex(a)); const B = hex(toHex(b)); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
  const rgba = (c, a) => `rgba(${hex(toHex(c)).join(',')},${a})`;

  // Time-of-day keyframes; every landscape colour is interpolated between these.
  const SKY = [
    { at: 0.00, top: '#2b3a67', mid: '#c97b9a', low: '#ffcf9e', sun: '#ffd7a8', cloudT: '#ffe3d6', cloudB: '#c79bb4', m1: '#9b8db3', m2: '#75699a', trees: '#2a344a', hills: '#3d5848', grass: '#5f9e4f', grass2: '#3f7a3a', soil: '#6b4a35', soil2: '#45301f', stars: 0.35, night: 0.2 },
    { at: 0.14, top: '#3d8fd9', mid: '#7cc0ef', low: '#d6eefc', sun: '#fff6d5', cloudT: '#ffffff', cloudB: '#c9dcef', m1: '#a9c6e3', m2: '#7fa7cf', trees: '#2f6b4f', hills: '#4f9a5b', grass: '#6cc04a', grass2: '#4c9a37', soil: '#7a5236', soil2: '#4e3420', stars: 0, night: 0 },
    { at: 0.42, top: '#3a86d4', mid: '#78bced', low: '#d3ecfb', sun: '#fff6d5', cloudT: '#ffffff', cloudB: '#c9dcef', m1: '#a6c3e0', m2: '#7ca4cc', trees: '#2d684c', hills: '#4c9758', grass: '#69bd48', grass2: '#4a9735', soil: '#785035', soil2: '#4d331f', stars: 0, night: 0 },
    { at: 0.55, top: '#3f6fb5', mid: '#f2b06b', low: '#ffd9a0', sun: '#ffc66b', cloudT: '#ffe2b8', cloudB: '#d99a86', m1: '#d0a08c', m2: '#a77a84', trees: '#3a3644', hills: '#5d6640', grass: '#8fb04a', grass2: '#6c8a35', soil: '#7a4f30', soil2: '#4a2f1b', stars: 0, night: 0.05 },
    { at: 0.66, top: '#1d1f4a', mid: '#8a3f74', low: '#f0846a', sun: '#ff8f5e', cloudT: '#f7a58e', cloudB: '#6e4a78', m1: '#6b4c7a', m2: '#4d3866', trees: '#1f1d33', hills: '#2d3446', grass: '#456c48', grass2: '#2c4f36', soil: '#4a3328', soil2: '#2c1d16', stars: 0.45, night: 0.45 },
    { at: 0.76, top: '#04071a', mid: '#0c1840', low: '#1d3462', sun: '#e8eefc', cloudT: '#3b4a75', cloudB: '#1a2448', m1: '#21305a', m2: '#18254d', trees: '#0b1226', hills: '#14223a', grass: '#27493f', grass2: '#183229', soil: '#2a2230', soil2: '#18121e', stars: 1, night: 1 },
    { at: 0.93, top: '#04071a', mid: '#0c1840', low: '#1d3462', sun: '#e8eefc', cloudT: '#3b4a75', cloudB: '#1a2448', m1: '#21305a', m2: '#18254d', trees: '#0b1226', hills: '#14223a', grass: '#27493f', grass2: '#183229', soil: '#2a2230', soil2: '#18121e', stars: 1, night: 1 },
  ];
  function palette(phase) {
    const keys = [...SKY, { ...SKY[0], at: 1 }];
    let i = 0;
    while (i < keys.length - 2 && phase >= keys[i + 1].at) i++;
    const a = keys[i]; const b = keys[i + 1];
    const t = Math.min(1, Math.max(0, (phase - a.at) / (b.at - a.at)));
    const s = t * t * (3 - 2 * t);
    const out = {};
    for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * s : mix(a[k], b[k], s);
    return out;
  }

  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const peak = (v) => (1 - Math.abs(Math.sin(v))) ** 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Sound: the original's cheer and sad tones ----------
  const Sound = {
    ac: null,
    get on() { return OS.state.runner.sound !== false; },
    init() {
      if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } }
      if (this.ac?.state === 'suspended') this.ac.resume();
    },
    tone(freq, dur, type = 'sine', delay = 0, vol = 0.18) {
      if (!this.ac || !this.on) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const gn = this.ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(vol, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(this.ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    cheer() { this.tone(523, 0.12, 'triangle', 0, 0.16); this.tone(659, 0.12, 'triangle', 0.11, 0.16); this.tone(784, 0.16, 'triangle', 0.22, 0.16); },
    sad() { this.tone(392, 0.14, 'sine', 0, 0.14); this.tone(370, 0.14, 'sine', 0.12, 0.13); this.tone(349, 0.18, 'sine', 0.24, 0.12); },
    jump() { this.tone(420, 0.08, 'triangle', 0, 0.05); },
  };

  OS.registerApp('runner', {
    title: 'Know Your Distro',
    blurb: 'Arcade: run, and pick the distros in your family',
    w: 980, h: 600,
    create(win) {
      const R = OS.state.runner;
      R.mode = R.mode === 'Infinite' ? 'Infinite' : 'Rapid';
      R.infiniteHigh ||= 0;
      R.rapidBest ||= 0;

      // ---------- State ----------
      let mode = R.mode;
      let screen = 'launch'; // launch | pick | play | paused | finish
      let team = null;
      let score = 0;        // this team's score
      let total = 0;        // Rapid: sum across rounds; Infinite: total across teams
      let wrong = 0;
      let lives = LIVES_PER_TEAM;
      let streak = 0;
      let rapidPlayed = [];
      let rapidScores = [];
      let showcase = false;
      let g = null;         // world state
      let W = 800; let H = 450; let GROUND = 380; let scale = 1;
      let raf = null; let last = 0;
      let mapHeld = false;
      let userPaused = false;
      let stars = [];

      // ---------- DOM ----------
      const canvas = el('canvas', { class: 'kd-canvas', tabindex: '0', 'aria-label': 'Know Your Distro game. Space to jump, A and D to walk.' });
      const mainCtx = canvas.getContext('2d');
      let ctx = mainCtx;
      const vignette = document.createElement('canvas');

      const pill = (label, valueEl) => el('div', { class: 'kd-pill' }, label, valueEl);
      const teamLabel = el('strong', { text: '—' });
      const teamPill = el('div', { class: 'kd-pill kd-team' }, 'Team ', teamLabel);
      const scoreEl = el('strong', { text: '0' });
      const totalEl = el('strong', { text: '0' });
      const wrongEl = el('strong', { text: '0' });
      const bestEl = el('strong', { text: '0' });
      const bestPill = pill('Best ', bestEl);
      const livesEl = el('div', { class: 'kd-lives', 'aria-label': 'Lives' });
      const weatherEl = el('strong', { text: 'Clear' });
      const speedEl = el('strong', { text: '1.0×' });
      const modeRapid = el('button', { class: 'kd-seg', text: 'Rapid', onclick: () => askMode('Rapid') });
      const modeInf = el('button', { class: 'kd-seg', text: 'Infinite', onclick: () => askMode('Infinite') });
      const svgBtn = (title, svg, fn) => el('button', { class: 'kd-btn icon', title, 'aria-label': title, html: `<svg viewBox="0 0 16 16">${svg}</svg>`, onclick: fn });
      const teamsBtn = el('button', { class: 'kd-btn', text: 'Teams', onclick: () => openTeams() });
      const pauseBtn = svgBtn('Pause (P)', '<path d="M5 3v10M11 3v10"/>', () => togglePause());
      const soundBtn = svgBtn('Sound', '', () => toggleSound());
      const showcaseBadge = el('div', { class: 'kd-showcase', text: 'SHOWCASE', hidden: true });
      const hud = el('div', { class: 'kd-hud' },
        el('div', { class: 'kd-row' }, teamPill, pill('Score ', scoreEl), pill('Total ', totalEl), pill('Wrong ', wrongEl), bestPill, livesEl),
        el('div', { class: 'kd-row' },
          pill('Weather ', weatherEl), pill('Speed ', speedEl),
          el('div', { class: 'kd-segs', role: 'group', 'aria-label': 'Mode' }, modeRapid, modeInf),
          teamsBtn,
          svgBtn('Reset (R)', '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>', () => toLaunch()),
          pauseBtn, soundBtn,
          svgBtn('Distro map (hold M)', '<path d="M1.5 3.5l4.3-2 4.4 2 4.3-2v11l-4.3 2-4.4-2-4.3 2z M5.8 1.5v11 M10.2 3.5v11"/>', () => showMap(!mapView.classList.contains('show')))));
      const legend = el('div', { class: 'kd-legend', text: 'Jump: Space / ↑ / Tap (up to 4 in the air) · Walk: A / D · Hold M: map · P: pause · R: reset' });
      const stage = el('div', { class: 'kd-stage' }, canvas, hud, legend, showcaseBadge);
      const overlay = el('div', { class: 'kd-overlay' });
      const mapView = el('div', { class: 'kd-map', role: 'dialog', 'aria-label': 'Linux distro family map' });
      const root = el('div', { class: 'kd-root' }, stage, overlay, mapView);
      win.body.append(root);

      // ---------- HUD ----------
      function renderLives() {
        livesEl.replaceChildren(...Array.from({ length: LIVES_PER_TEAM }, (_, i) => el('span', { class: `kd-life${i < lives ? '' : ' off'}` })));
        livesEl.setAttribute('aria-label', `${lives} of ${LIVES_PER_TEAM} lives`);
      }
      function updateHud() {
        scoreEl.textContent = String(score);
        totalEl.textContent = String(total);
        wrongEl.textContent = String(wrong);
        bestEl.textContent = String(mode === 'Infinite' ? R.infiniteHigh : R.rapidBest);
        bestPill.title = mode === 'Infinite' ? 'Best Infinite total' : 'Best Rapid total';
        teamLabel.textContent = team || '—';
        teamPill.querySelector('img')?.remove();
        if (team) teamPill.insertBefore(icon(team, 18), teamLabel);
        modeRapid.classList.toggle('on', mode === 'Rapid');
        modeInf.classList.toggle('on', mode === 'Infinite');
        modeRapid.setAttribute('aria-pressed', String(mode === 'Rapid'));
        modeInf.setAttribute('aria-pressed', String(mode === 'Infinite'));
        teamsBtn.disabled = mode === 'Rapid' && (screen === 'play' || screen === 'paused');
        teamsBtn.title = teamsBtn.disabled ? 'No switching during a Rapid round' : 'Choose a team';
        speedEl.textContent = `${speedMultiplier(score).toFixed(1)}×`;
        pauseBtn.innerHTML = screen === 'paused'
          ? '<svg viewBox="0 0 16 16"><path class="f" d="M5 3l8 5-8 5z"/></svg>'
          : '<svg viewBox="0 0 16 16"><path d="M5 3v10M11 3v10"/></svg>';
        soundBtn.innerHTML = Sound.on
          ? '<svg viewBox="0 0 16 16"><path class="f" d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9"/></svg>'
          : '<svg viewBox="0 0 16 16"><path class="f" d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 6l4 4M15 6l-4 4"/></svg>';
        showcaseBadge.hidden = !showcase;
        renderLives();
      }

      // ---------- Overlays ----------
      function showOverlay(cls, ...children) {
        overlay.className = `kd-overlay show ${cls}`;
        overlay.replaceChildren(el('div', { class: 'kd-modal' }, ...children));
        overlay.querySelector('.kd-primary, button')?.focus();
      }
      const hideOverlay = () => { overlay.className = 'kd-overlay'; overlay.replaceChildren(); };

      const MODE_TEXT = {
        Rapid: [
          ['🎮 Rapid mode', 'Three runs, each with a different team and 10 lives. Your final score is the sum of all three.'],
          ['🔒 No switching', 'Once a run starts you stay with that team until its lives run out.'],
        ],
        Infinite: [
          ['♾️ Infinite mode', 'Play endlessly and switch teams any time. Your total carries over.'],
          ['🏆 Best total', 'Your highest Infinite total is remembered on this computer.'],
        ],
      };

      function renderLaunch() {
        const desc = el('div', { class: 'kd-modes-desc' });
        const segR = el('button', { class: `kd-mode-card${mode === 'Rapid' ? ' on' : ''}`, onclick: () => { setMode('Rapid'); renderLaunch(); } },
          el('strong', { text: 'Rapid' }), el('small', { text: '3 teams · 10 lives each' }));
        const segI = el('button', { class: `kd-mode-card${mode === 'Infinite' ? ' on' : ''}`, onclick: () => { setMode('Infinite'); renderLaunch(); } },
          el('strong', { text: 'Infinite' }), el('small', { text: 'Endless · switch any time' }));
        for (const [h, p] of MODE_TEXT[mode]) desc.append(el('h4', { text: h }), el('p', { text: p }));
        showOverlay('launch',
          el('h2', { class: 'kd-title', text: 'Know Your Distro 🐧' }),
          el('p', { class: 'kd-sub', text: 'Race across the Linux landscape and pick the distros that belong to your team!' }),
          el('div', { class: 'kd-mode-cards', role: 'radiogroup', 'aria-label': 'Mode' }, segR, segI),
          desc,
          el('ul', { class: 'kd-rules' },
            el('li', {}, 'Correct pick ', el('b', { text: '+50' }), ' · wrong pick ', el('b', { text: '−20' }), ' and a life'),
            el('li', {}, 'Starts slow and ', el('b', { text: 'speeds up' }), ' as you score, up to 2×'),
            el('li', {}, el('b', { text: 'Space / ↑ / Tap' }), ' to jump, up to 3 more times in mid-air'),
            el('li', {}, el('b', { text: 'A / D' }), ' to walk · hold ', el('b', { text: 'M' }), ' for the distro map · ', el('b', { text: 'P' }), ' to pause')),
          el('p', { class: 'kd-best', text: mode === 'Infinite' ? `Best Infinite total: ${R.infiniteHigh}` : `Best Rapid total: ${R.rapidBest}` }),
          el('button', { class: 'kd-primary', text: 'Play (Enter)', onclick: () => play() }));
      }

      function renderTeams(title, text, closable) {
        const choices = TEAM_NAMES.filter((t) => (mode === 'Rapid' ? !rapidPlayed.includes(t) : true));
        showOverlay('teams',
          el('h2', { text: title }),
          el('p', { class: 'kd-sub', text }),
          el('div', { class: 'kd-team-grid' }, choices.map((t) => el('button', {
            class: `kd-team-btn${t === team ? ' on' : ''}`, style: `--team: ${TEAM_COLOR[t]}`,
            onclick: () => chooseTeam(t),
          }, icon(t, 36), el('span', { class: 'kd-team-text' }, el('strong', { text: t }), el('span', { class: 'kd-team-members' }, TEAMS[t].map((d) => icon(d, 18))))))),
          closable ? el('button', { class: 'kd-ghost', text: 'Close', onclick: () => { hideOverlay(); resume(); } }) : null);
      }

      function renderFinish() {
        showOverlay('finish',
          el('button', { class: 'kd-x', 'aria-label': 'Close', text: '×', onclick: () => toLaunch() }),
          el('div', { class: 'kd-flag', text: '🏁' }),
          el('h2', { class: 'kd-grad', text: 'Rapid Mode Complete!' }),
          el('p', { class: 'kd-final' }, 'Final Score: ', el('strong', { text: String(total) })),
          total >= R.rapidBest && total > 0 ? el('p', { class: 'kd-newbest', text: '★ New best Rapid score!' }) : null,
          el('p', { class: 'kd-sub', text: 'Here\'s how your runs went:' }),
          el('ul', { class: 'kd-rounds' }, rapidScores.map((s, i) => el('li', {}, el('span', {}, `Round ${i + 1}`), icon(rapidPlayed[i], 20), el('span', { text: rapidPlayed[i] }), el('strong', { text: String(s) })))),
          el('p', { class: 'kd-note' }, '📌 ', el('b', { text: 'Do not refresh' }), ' this window. Keep this screen to identify the top scorer.'),
          el('button', { class: 'kd-primary', text: 'New game', onclick: () => toLaunch() }));
      }

      function confirmBox(text, onYes) {
        const back = { cls: overlay.className, kids: [...overlay.childNodes] };
        const wasPlaying = screen === 'play';
        if (wasPlaying) setPaused(true, true);
        showOverlay('confirm', el('h3', { text }),
          el('div', { class: 'kd-row center' },
            el('button', { class: 'kd-primary', text: 'Switch', onclick: onYes }),
            el('button', { class: 'kd-ghost', text: 'Cancel', onclick: () => { overlay.className = back.cls; overlay.replaceChildren(...back.kids); if (wasPlaying) setPaused(false, true); } })));
      }

      // ---------- Map (hold M) ----------
      function renderMap() {
        const rows = TEAM_NAMES.map((t) => {
          const row = el('section', { class: `kd-map-fam${t === team ? ' mine' : ''}` },
            el('header', {}, icon(t, 34), el('div', {}, el('h3', { text: t }), t === team ? el('em', { text: 'Your team' }) : null)),
            el('ul', {}, TEAMS[t].map((d) => el('li', {}, icon(d, 22), el('span', { text: d })))));
          row.style.setProperty('--fam', TEAM_COLOR[t]);
          return row;
        });
        mapView.replaceChildren(el('div', { class: 'kd-map-card' },
          el('div', { class: 'kd-map-root' }, el('span', { class: 'kd-map-tux', text: '🐧' }), el('div', {}, el('h2', { text: 'Linux distro families' }),
            el('p', { text: 'Every distro is built on the Linux kernel. Most are built on top of one of these five families.' }))),
          el('div', { class: 'kd-map-rows' }, rows),
          el('p', { class: 'kd-map-foot', text: team ? `You're on team ${team}: run into its distros, jump over the rest.` : 'Hold M during a run to check this map. The game pauses while it\'s open.' })));
      }
      function showMap(on) {
        if (on) {
          renderMap();
          mapView.classList.add('show');
          stage.classList.add('dim');
          OS.achievements.unlock('runner_map');
          if (screen === 'play') setPaused(true, true);
        } else {
          mapView.classList.remove('show');
          stage.classList.remove('dim');
          if (screen === 'paused' && !userPaused) setPaused(false, true);
        }
      }

      // ---------- Flow ----------
      function setMode(m) {
        mode = m;
        R.mode = m;
        OS.save();
        resetScores();
        updateHud();
      }
      function resetScores() {
        score = 0; total = 0; wrong = 0; lives = LIVES_PER_TEAM; streak = 0; team = null;
        rapidPlayed = []; rapidScores = [];
      }
      function askMode(m) {
        if (m === mode) return;
        if (screen === 'launch') { setMode(m); renderLaunch(); return; }
        confirmBox(`Switch to ${m} mode? This resets your current score and lives.`, () => { setMode(m); toLaunch(); });
      }

      function toLaunch() {
        screen = 'launch';
        userPaused = false;
        resetScores();
        newWorld();
        updateHud();
        renderLaunch();
        kick();
      }

      function play() {
        Sound.init();
        OS.achievements.unlock('runner_play');
        if (mode === 'Rapid') renderTeams(`Choose Team ${rapidPlayed.length + 1} of ${RAPID_ROUNDS}`, 'Pick your team for this run. No switching mid-run.', false);
        else renderTeams('Choose Your Team', 'Pick a team to start. You can switch any time.', false);
        screen = 'pick';
      }

      function chooseTeam(t) {
        if (mode === 'Rapid' && !rapidPlayed.includes(t)) rapidPlayed.push(t);
        team = t;
        R.lastTeam = t;
        lives = LIVES_PER_TEAM; wrong = 0; score = 0; streak = 0;
        g.items = [];
        g.untilNext = 260;
        hideOverlay();
        screen = 'play';
        userPaused = false;
        updateHud();
        canvas.focus();
        kick();
      }

      function openTeams() {
        if (teamsBtn.disabled) return;
        if (screen === 'play') setPaused(true, true);
        renderTeams('Choose Your Team', mode === 'Rapid' ? 'Pick a team. No switching mid-run.' : 'Switch any time. Your total carries over.', screen === 'paused');
      }

      // A team ran out of lives.
      function endRound() {
        screen = 'pick';
        if (mode === 'Rapid') {
          rapidScores.push(score);
          if (rapidScores.length >= RAPID_ROUNDS) {
            screen = 'finish';
            R.rapidBest = Math.max(R.rapidBest, total);
            OS.save();
            OS.achievements.unlock('runner_rapid');
            updateHud();
            renderFinish();
            return;
          }
          renderTeams(`Choose Team ${rapidPlayed.length + 1} of ${RAPID_ROUNDS}`, `Out of lives for ${team} (scored ${score}). Pick your next team.`, false);
        } else {
          renderTeams('Choose Your Team', `Out of lives for ${team}. Pick a team to continue. Your total of ${total} carries over.`, false);
        }
        updateHud();
      }

      function setPaused(on, silent) {
        if (on && screen === 'play') screen = 'paused';
        else if (!on && screen === 'paused') { screen = 'play'; canvas.focus(); kick(); }
        if (g) g.tux.held = false;
        if (!silent && on) showOverlay('pause', el('h2', { text: 'Paused' }), el('p', { class: 'kd-sub', text: 'Press P or click Resume to continue.' }),
          el('button', { class: 'kd-primary', text: 'Resume', onclick: () => togglePause() }));
        if (!on && overlay.classList.contains('pause')) hideOverlay();
        updateHud();
      }
      function togglePause() {
        if (screen === 'play') { userPaused = true; setPaused(true); }
        else if (screen === 'paused') { userPaused = false; setPaused(false); }
      }
      const resume = () => { if (screen === 'paused' && !userPaused) setPaused(false, true); };

      function toggleSound() {
        R.sound = !Sound.on;
        OS.save();
        Sound.init();
        updateHud();
      }

      // ---------- World ----------
      function newWorld() {
        g = {
          t: 0, dist: 400, speed: BASE_SPEED, items: [], parts: [], texts: [], flies: [], birds: [], snow: [],
          tux: { x: 0, y: GROUND, vy: 0, ground: true, held: false, buffer: 0, coyote: 0, airJumps: MAX_AIR_JUMPS, step: 0, squash: 0, blink: 2, hurt: 0, sparkle: 0 },
          untilNext: 260, flash: 0, shake: 0, birdIn: 3,
          weather: 'Clear', weatherT: 0, snowLvl: 0, overcastLvl: 0,
          clouds: Array.from({ length: 6 }, (_, i) => ({ x: i * 260 + Math.random() * 160, y: 0.08 + Math.random() * 0.25, s: 0.6 + Math.random() * 0.7, seed: Math.random() * 100 })),
        };
        g.tux.x = W * 0.22;
        layers.sky = null;
        weatherEl.textContent = 'Clear';
      }

      function spawnTile(offset) {
        // Your team's distros make up OWN_TEAM_SHARE of the tiles; the rest come from every other team.
        const own = team && Math.random() < OWN_TEAM_SHARE;
        const pool = own ? TEAMS[team] : TEAM_NAMES.filter((t) => t !== team).flatMap((t) => TEAMS[t]);
        const name = pick(pool);
        g.items.push({ name, correct: team ? TEAMS[team].includes(name) : false, x: W + 20 + (offset || 0), y: GROUND - TILE - rand(0, 8), w: TILE, h: TILE });
      }
      function spawnPattern() {
        if (Math.random() < 0.25) { spawnTile(0); spawnTile(PAIR_GAP); } else spawnTile(0);
      }

      function burst(x, y, color, n = 14) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 60 + Math.random() * 160;
          g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.6, color, size: 2 + Math.random() * 2.5 });
        }
      }

      function jump() {
        const t = g.tux;
        if (t.ground || t.coyote > 0) {
          t.vy = JUMP_V; t.ground = false; t.coyote = 0; t.airJumps = MAX_AIR_JUMPS; t.squash = -0.14;
          for (let i = 0; i < 5; i++) g.parts.push({ x: t.x - 6, y: GROUND - 2, vx: -40 - Math.random() * 80, vy: -20 - Math.random() * 40, life: 0.4, color: 'rgba(255,255,255,0.6)', size: 3 });
          Sound.jump();
        } else if (t.airJumps > 0) {
          t.vy = JUMP_V * AIR_JUMP_SCALE; t.airJumps--; t.sparkle = 0.3;
          burst(t.x, t.y - 6, 'rgba(255,255,255,0.8)', 6);
          Sound.jump();
        }
      }

      function update(dt) {
        g.t += dt;
        g.speed = BASE_SPEED * speedMultiplier(score);
        const move = g.speed * dt;
        g.dist += move;
        for (const c of g.clouds) { c.x -= move * 0.06 * c.s; if (c.x < -260) { c.x = W + Math.random() * 300; c.y = 0.08 + Math.random() * 0.25; } }

        // Weather changes every ~20 s; the visual level eases in and out.
        g.weatherT += dt;
        if (g.weatherT > WEATHER_EVERY) {
          g.weatherT = 0;
          g.weather = pick(['Clear', 'Snow', 'Overcast'].filter((w) => w !== g.weather));
          weatherEl.textContent = g.weather;
        }
        const ease = Math.min(1, dt / 2);
        g.snowLvl += ((g.weather === 'Snow' ? 1 : 0) - g.snowLvl) * ease * 2;
        g.overcastLvl += ((g.weather === 'Overcast' ? 1 : g.weather === 'Snow' ? 0.4 : 0) - g.overcastLvl) * ease * 2;

        const t = g.tux;
        // Showcase mode: Tux plays by himself (handy for demos at an event booth).
        if (showcase) autopilot();
        // Walk with A/D while on the ground, between 10% and 80% of the width.
        if (t.ground && !showcase) t.x += ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * WALK_SPEED * dt;
        t.x = Math.max(W * 0.1, Math.min(W * 0.8, t.x));

        t.buffer -= dt;
        t.coyote = t.ground ? 0.1 : t.coyote - dt;
        if (t.buffer > 0 && (t.ground || t.coyote > 0 || t.airJumps > 0)) { t.buffer = 0; jump(); }
        t.vy += (t.vy < 0 && t.held ? GRAVITY_HELD : GRAVITY) * dt;
        t.y += t.vy * dt;
        if (t.y >= GROUND) {
          if (!t.ground && t.vy > 250) t.squash = 0.16;
          t.y = GROUND; t.vy = 0; t.ground = true; t.airJumps = MAX_AIR_JUMPS;
        }
        t.squash *= Math.pow(0.0005, dt);
        t.step += dt * (6 + g.speed / 40 + (t.ground && (keys.left || keys.right) ? 4 : 0));
        t.blink -= dt;
        if (t.blink < -0.12) t.blink = 2 + Math.random() * 3;
        t.hurt = Math.max(0, t.hurt - dt);
        t.sparkle = Math.max(0, t.sparkle - dt);
        g.flash = Math.max(0, g.flash - dt);

        g.untilNext -= move;
        if (g.untilNext <= 0) { spawnPattern(); g.untilNext = GAP_BASE + rand(0, GAP_RANGE); }

        const box = { l: t.x - 12 * TUX_SCALE, r: t.x + 14 * TUX_SCALE, t: t.y - 40 * TUX_SCALE, b: t.y - 3 };
        for (const it of g.items) {
          it.x -= move;
          if (it.done) continue;
          const pad = 5;
          const hit = box.l < it.x + it.w - pad && box.r > it.x + pad && box.t < it.y + it.h - pad && box.b > it.y + pad;
          if (!hit) {
            if (it.correct && !it.missed && it.x + it.w < box.l) { it.missed = true; streak = 0; }
            continue;
          }
          it.done = true;
          const cx = it.x + it.w / 2; const cy = it.y + it.h / 2;
          if (it.correct) {
            score += SCORE_GOOD;
            total += SCORE_GOOD;
            streak++;
            burst(cx, cy, TEAM_COLOR[team]);
            burst(cx, cy, '#fff8d6', 6);
            g.texts.push({ x: cx, y: it.y - 8, text: `+50 ${it.name}`, color: '#ffffff', life: 1 });
            Sound.cheer();
            if (score >= 500) OS.achievements.unlock('runner_500');
            if (streak >= 10) OS.achievements.unlock('runner_combo');
          } else {
            score = Math.max(0, score + SCORE_BAD);
            total = Math.max(0, total + SCORE_BAD);
            wrong++; lives--; streak = 0;
            t.hurt = 0.6; g.flash = 0.25; g.shake = 0.2;
            burst(cx, cy, '#ff5a5a', 16);
            g.texts.push({ x: cx, y: it.y - 8, text: `−20 · ${it.name} is in the ${teamOf(it.name)} family`, color: '#ffb4b4', life: 1.4 });
            Sound.sad();
          }
          if (mode === 'Infinite' && total > R.infiniteHigh) { R.infiniteHigh = total; OS.save(); }
          updateHud();
          if (lives <= 0) { endRound(); break; }
        }
        g.items = g.items.filter((it) => it.x + it.w > -40 && !it.done);
      }

      // Showcase autopilot: walk toward the next correct tile, jump over wrong ones.
      function autopilot() {
        const t = g.tux;
        const ahead = g.items.filter((it) => !it.done && it.x + it.w > t.x - 10).sort((a, b) => a.x - b.x);
        const threat = ahead.find((it) => !it.correct && it.x - (t.x + 14) < 30 + g.speed * 0.12 && it.x + it.w > t.x - 12);
        if (threat && t.ground) { t.buffer = 0.12; t.held = true; setTimeout(() => { t.held = false; }, 140); }
        const target = ahead.find((it) => it.correct);
        if (t.ground && target && !threat) t.x += Math.sign(target.x + target.w / 2 - t.x) * Math.min(3, Math.abs(target.x - t.x));
      }

      function ambient(dt) {
        for (const p of g.parts) { p.life -= dt; p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        g.parts = g.parts.filter((p) => p.life > 0);
        for (const tx of g.texts) { tx.life -= dt; tx.y -= 32 * dt; }
        g.texts = g.texts.filter((tx) => tx.life > 0);
        g.shake = Math.max(0, g.shake - dt);
        const moving = screen === 'play';
        const pal = palette((g.dist / DAY_LEN) % 1);
        g.birdIn -= dt;
        if (g.birdIn <= 0 && pal.night < 0.5 && g.snowLvl < 0.5) {
          const flock = 2 + Math.floor(Math.random() * 3);
          const y = H * (0.15 + Math.random() * 0.2);
          for (let i = 0; i < flock; i++) g.birds.push({ x: W + 20 + i * 18, y: y + (i % 2) * 10, v: 40 + Math.random() * 20, ph: Math.random() * 6 });
          g.birdIn = 6 + Math.random() * 6;
        }
        for (const b of g.birds) { b.x -= (b.v + (moving ? g.speed * 0.1 : 0)) * dt; b.ph += dt * 9; }
        g.birds = g.birds.filter((b) => b.x > -30);
        if (pal.night > 0.5 && g.flies.length < 26 && Math.random() < 0.2) g.flies.push({ x: Math.random() * W, y: GROUND - 10 - Math.random() * 90, ph: Math.random() * 6, life: 4 + Math.random() * 4 });
        for (const f of g.flies) { f.life -= dt; f.ph += dt; f.x += Math.sin(f.ph * 1.3) * 12 * dt - (moving ? g.speed * 0.15 * dt : 0); f.y += Math.cos(f.ph) * 8 * dt; }
        g.flies = g.flies.filter((f) => f.life > 0 && f.x > -10);
        // snowfall
        const want = Math.round(g.snowLvl * 180);
        while (g.snow.length < want) g.snow.push({ x: Math.random() * (W + 100), y: -10 - Math.random() * H, v: 30 + Math.random() * 50, r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6 });
        if (g.snow.length > want) g.snow.length = want;
        for (const s of g.snow) {
          s.y += s.v * dt; s.ph += dt;
          s.x += (Math.sin(s.ph) * 10 - 20 - (moving ? g.speed * 0.3 : 0)) * dt;
          if (s.y > H || s.x < -10) { s.y = -10; s.x = Math.random() * (W + 100); }
        }
      }

      // ---------- Landscape: pre-rendered seamless strips ----------
      const LAYER_W = 2048;
      const BUCKETS = 64;
      const TAU = Math.PI * 2;
      const LAYER_NAMES = ['sky', 'far', 'mid', 'forestBack', 'hills', 'forestFront', 'ground', 'rays', 'clouds'];
      const layers = { bucket: -1, queue: [], pal: null, clouds: [] };
      const pRidge = (x, seed) => {
        const u = (x / LAYER_W) * TAU;
        return peak(u * 1.5 + seed) * 0.55 + peak(u * 3 + seed * 2.3) * 0.3 + peak(u * 7.5 + seed * 4.1) * 0.12 + Math.sin(u * 17 + seed) * 0.02;
      };
      const wrapI = (i, n) => ((i % n) + n) % n;
      const snap = (v) => Math.round(v * scale) / scale;

      function surface(w, h, top) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.ceil(h * scale));
        const x = c.getContext('2d');
        x.setTransform(scale, 0, 0, scale, 0, -top * scale);
        return { c, x, top, w: c.width / scale, h: c.height / scale };
      }
      function paint(L, fn) { const prev = ctx; ctx = L.x; fn(); ctx = prev; return L; }

      function range(color, haze, base, amp, seed, snowCap) {
        const pts = [];
        for (let x = -12; x <= LAYER_W + 12; x += 4) pts.push([x, base - amp * (0.15 + pRidge(x, seed))]);
        ctx.beginPath();
        ctx.moveTo(-12, GROUND + 12);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.lineTo(LAYER_W + 12, GROUND + 12);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, base - amp * 1.2, 0, base + 30);
        fill.addColorStop(0, color);
        fill.addColorStop(1, mix(color, haze, 0.55));
        ctx.fillStyle = fill;
        ctx.fill();
        if (snowCap) {
          ctx.save();
          ctx.clip();
          ctx.fillStyle = rgba(snowCap, 0.85);
          ctx.beginPath();
          const capY = base - amp * 0.8;
          ctx.moveTo(-12, base - amp * 3);
          for (const [x] of pts) { const u = (x / LAYER_W) * TAU; ctx.lineTo(x, capY + Math.sin(u * 26 + seed) * 4 + Math.sin(u * 68) * 2); }
          ctx.lineTo(LAYER_W + 12, base - amp * 3);
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }

      function forest(base, spacing, hMin, hMax, color, seed) {
        const n = Math.round(LAYER_W / spacing);
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = -2; i < n + 2; i++) {
          const k = wrapI(i, n);
          const x = i * spacing + hash(k + seed) * spacing * 0.8;
          const h = hMin + hash(k + seed + 7.3) * (hMax - hMin);
          const w = h * 0.36;
          const y = base + Math.sin(k * 0.7) * 4;
          for (let q = 0; q < 3; q++) {
            const ty = y - h * (0.28 + q * 0.26);
            const tw = w * (1 - q * 0.22);
            ctx.moveTo(x - tw, ty + h * 0.32);
            ctx.lineTo(x, ty - h * 0.18);
            ctx.lineTo(x + tw, ty + h * 0.32);
          }
          ctx.rect(x - h * 0.03, y - h * 0.15, h * 0.06, h * 0.18);
        }
        ctx.fill();
      }

      function groundStrip(p) {
        const sg = ctx.createLinearGradient(0, GROUND, 0, H);
        sg.addColorStop(0, p.soil);
        sg.addColorStop(1, p.soil2);
        ctx.fillStyle = sg;
        ctx.fillRect(-4, GROUND, LAYER_W + 8, H - GROUND + 20);
        const stones = 64;
        for (let i = -1; i <= stones; i++) {
          const k = wrapI(i, stones);
          if (hash(k * 3.1) < 0.45) continue;
          const x = i * (LAYER_W / stones) + hash(k) * (LAYER_W / stones);
          const y = GROUND + 18 + hash(k + 1.7) * (H - GROUND - 26);
          const r = 2 + hash(k + 2.2) * 4;
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath(); ctx.ellipse(x, y + 1, r * 1.3, r * 0.8, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.beginPath(); ctx.ellipse(x - 0.5, y - 0.5, r, r * 0.6, 0, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = p.grass2;
        ctx.fillRect(-4, GROUND, LAYER_W + 8, 10);
        ctx.fillStyle = p.grass;
        ctx.fillRect(-4, GROUND - 1, LAYER_W + 8, 6);
        const blades = 512;
        ctx.beginPath();
        for (let i = -1; i <= blades; i++) {
          const k = wrapI(i, blades);
          const x = i * (LAYER_W / blades);
          const h = 4 + hash(k * 1.37) * 7;
          const lean = (hash(k * 2.11) - 0.5) * 4;
          ctx.moveTo(x - 1.6, GROUND + 1);
          ctx.lineTo(x + lean, GROUND - h);
          ctx.lineTo(x + 1.6, GROUND + 1);
        }
        ctx.fill();
        const flowers = 56;
        for (let i = -1; i <= flowers; i++) {
          const k = wrapI(i, flowers);
          if (hash(k * 5.3) < 0.55) continue;
          const x = i * (LAYER_W / flowers) + hash(k * 1.9) * (LAYER_W / flowers);
          const col = ['#ffd84d', '#ff8fb1', '#ffffff', '#b98cff'][Math.floor(hash(k * 7.7) * 4)];
          ctx.strokeStyle = p.grass2;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, GROUND + 1); ctx.lineTo(x, GROUND - 8); ctx.stroke();
          ctx.fillStyle = col;
          for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(x + Math.cos(q * 1.57) * 2.2, GROUND - 9 + Math.sin(q * 1.57) * 2.2, 1.7, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#ffb347';
          ctx.beginPath(); ctx.arc(x, GROUND - 9, 1.3, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(-4, GROUND - 1, LAYER_W + 8, 1.5);
      }

      function cloudSprite(c, p) {
        const s = c.s;
        return paint(surface(220 * s, 90 * s, 0), () => {
          const cx = 110 * s; const cy = 60 * s;
          const cg = ctx.createLinearGradient(0, cy - 34 * s, 0, cy + 22 * s);
          cg.addColorStop(0, p.cloudT);
          cg.addColorStop(1, p.cloudB);
          ctx.fillStyle = cg;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ox = (i - 2.5) * 22 * s + Math.sin(c.seed + i) * 6 * s;
            const oy = -Math.abs(Math.sin(c.seed * 1.7 + i * 1.3)) * 18 * s;
            const rr = (16 + Math.abs(Math.sin(c.seed + i * 2.1)) * 14) * s;
            ctx.moveTo(cx + ox + rr, cy + oy);
            ctx.arc(cx + ox, cy + oy, rr, 0, TAU);
          }
          ctx.fill();
        });
      }

      function buildLayer(name, p) {
        const haze = toHex(p.low);
        if (name === 'sky') {
          layers.sky = paint(surface(W, GROUND + 24, 0), () => {
            const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
            sky.addColorStop(0, p.top);
            sky.addColorStop(0.55, p.mid);
            sky.addColorStop(1, p.low);
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, GROUND + 24);
            if (p.stars > 0.01) {
              ctx.fillStyle = '#ffffff';
              for (const st of stars) { ctx.globalAlpha = p.stars * st.a * 0.8; ctx.fillRect(st.x * W, st.y * GROUND * 0.8, st.r, st.r); }
              ctx.globalAlpha = 1;
            }
          });
        } else if (name === 'far') {
          layers.far = paint(surface(LAYER_W, 360, GROUND - 350), () => {
            range(p.m1, haze, GROUND - 90, 190, 1.3, p.night < 0.5 ? '#ffffff' : '#9fb0d8');
            const hz = ctx.createLinearGradient(0, GROUND - 240, 0, GROUND);
            hz.addColorStop(0, rgba(haze, 0));
            hz.addColorStop(1, rgba(haze, 0.35));
            ctx.fillStyle = hz;
            ctx.fillRect(-4, GROUND - 240, LAYER_W + 8, 250);
          });
        } else if (name === 'mid') {
          layers.mid = paint(surface(LAYER_W, 230, GROUND - 220), () => range(p.m2, haze, GROUND - 55, 120, 4.7));
        } else if (name === 'forestBack') {
          layers.forestBack = paint(surface(LAYER_W, 120, GROUND - 115), () => forest(GROUND - 40, 32, 30, 52, rgba(p.trees, 0.75), 0));
        } else if (name === 'hills') {
          layers.hills = paint(surface(LAYER_W, 92, GROUND - 82), () => {
            ctx.beginPath();
            ctx.moveTo(-4, GROUND + 10);
            for (let x = -4; x <= LAYER_W + 4; x += 4) {
              const u = (x / LAYER_W) * TAU;
              ctx.lineTo(x, GROUND - 34 - 26 * (0.5 + 0.5 * Math.sin(u * 2)) - 10 * Math.sin(u * 6));
            }
            ctx.lineTo(LAYER_W + 4, GROUND + 10);
            const hg = ctx.createLinearGradient(0, GROUND - 80, 0, GROUND);
            hg.addColorStop(0, p.hills);
            hg.addColorStop(1, mix(p.hills, '#000000', 0.25));
            ctx.fillStyle = hg;
            ctx.fill();
          });
        } else if (name === 'forestFront') {
          layers.forestFront = paint(surface(LAYER_W, 100, GROUND - 92), () => forest(GROUND - 6, 64, 44, 78, p.trees, 50));
        } else if (name === 'ground') {
          layers.ground = paint(surface(LAYER_W, H - GROUND + 16, GROUND - 14), () => groundStrip(p));
        } else if (name === 'rays') {
          const RR = H * 0.9;
          layers.rays = paint(surface(RR * 2, RR * 2, 0), () => {
            ctx.translate(RR, RR);
            for (let i = 0; i < 10; i++) {
              ctx.rotate(TAU / 10);
              const ray = ctx.createLinearGradient(0, 0, 0, -RR);
              ray.addColorStop(0, rgba(p.sun, 0.12));
              ray.addColorStop(1, rgba(p.sun, 0));
              ctx.fillStyle = ray;
              ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-40, -RR); ctx.lineTo(40, -RR); ctx.lineTo(6, 0); ctx.fill();
            }
          });
          layers.rays.R = RR;
        } else if (name === 'clouds') {
          layers.clouds = g.clouds.map((c) => cloudSprite(c, p));
        }
      }

      // Rebuild scenery when the time-of-day colours step forward, one layer per frame.
      function ensureLayers() {
        const b = Math.floor(((g.dist / DAY_LEN) % 1) * BUCKETS) % BUCKETS;
        const p = palette((b + 0.5) / BUCKETS);
        if (!layers.sky) {
          LAYER_NAMES.forEach((n) => buildLayer(n, p));
          layers.bucket = b;
          layers.queue = [];
          return;
        }
        if (b !== layers.bucket) { layers.bucket = b; layers.queue = [...LAYER_NAMES]; layers.pal = p; }
        if (layers.queue.length) buildLayer(layers.queue.shift(), layers.pal);
      }

      function strip(L, factor) {
        const off = (g.dist * factor) % L.w;
        for (let x = -off; x < W; x += L.w) ctx.drawImage(L.c, snap(x), L.top, L.w, L.h);
      }

      function drawScene(p) {
        ctx.drawImage(layers.sky.c, 0, 0, layers.sky.w, layers.sky.h);
        if (p.stars > 0.3) {
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 24; i++) {
            const st = stars[i];
            ctx.globalAlpha = p.stars * Math.max(0, Math.sin(g.t * st.tw + st.ph)) * (1 - g.overcastLvl);
            ctx.fillRect(st.x * W - 0.5, st.y * GROUND * 0.8 - 0.5, st.r + 1, st.r + 1);
          }
          ctx.globalAlpha = 1;
        }
        if (p.night > 0.6 && g.overcastLvl < 0.6) {
          const a = ((p.night - 0.6) / 0.4) * (1 - g.overcastLvl);
          for (let band = 0; band < 2; band++) {
            const baseY = H * (0.16 + band * 0.08);
            ctx.beginPath();
            for (let x = 0; x <= W; x += 16) ctx.lineTo(x, baseY + Math.sin(x * 0.006 + g.t * 0.4 + band * 2) * 18 + Math.sin(x * 0.017 - g.t * 0.3) * 8);
            for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, baseY + 70 + Math.sin(x * 0.006 + g.t * 0.4 + band * 2) * 18);
            const au = ctx.createLinearGradient(0, baseY - 20, 0, baseY + 80);
            au.addColorStop(0, 'rgba(120,255,200,0)');
            au.addColorStop(0.35, `rgba(90,240,190,${0.16 * a})`);
            au.addColorStop(1, 'rgba(140,100,255,0)');
            ctx.fillStyle = au;
            ctx.fill();
          }
        }
        const phase = (g.dist / DAY_LEN) % 1;
        for (const b of [{ u: (phase + 0.02) / 0.74, sun: true }, { u: ((phase + 0.30) % 1) / 0.4, sun: false }]) {
          if (b.u < 0 || b.u > 1) continue;
          const bx = W * (0.08 + 0.84 * b.u);
          const by = GROUND - 30 - Math.sin(b.u * Math.PI) * (GROUND * 0.72);
          ctx.globalAlpha = Math.min(1, Math.sin(b.u * Math.PI) * 3) * (1 - g.overcastLvl * 0.75);
          const r = b.sun ? 26 : 18;
          const glow = ctx.createRadialGradient(bx, by, r * 0.6, bx, by, r * (b.sun ? 7 : 4));
          glow.addColorStop(0, rgba(b.sun ? p.sun : '#dfe8ff', b.sun ? 0.55 : 0.25));
          glow.addColorStop(1, rgba(b.sun ? p.sun : '#dfe8ff', 0));
          ctx.fillStyle = glow;
          ctx.fillRect(bx - r * 7, by - r * 7, r * 14, r * 14);
          if (b.sun) {
            const RR = layers.rays.R;
            ctx.save();
            ctx.globalAlpha *= 1 - g.overcastLvl;
            ctx.translate(bx, by);
            ctx.rotate(g.t * 0.03);
            ctx.drawImage(layers.rays.c, -RR, -RR, RR * 2, RR * 2);
            ctx.restore();
            ctx.fillStyle = p.sun;
            ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath(); ctx.arc(bx - r * 0.25, by - r * 0.25, r * 0.55, 0, TAU); ctx.fill();
          } else {
            ctx.fillStyle = '#eef2ff';
            ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(160,170,210,0.45)';
            [[-5, -4, 4], [5, 3, 3], [2, -8, 2], [-6, 6, 2.5]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(bx + dx, by + dy, rr, 0, TAU); ctx.fill(); });
          }
          ctx.globalAlpha = 1;
        }
        g.clouds.forEach((c, i) => {
          const L = layers.clouds[i];
          if (L) { ctx.globalAlpha = 0.92; ctx.drawImage(L.c, snap(c.x - 110 * c.s), snap(c.y * H - 60 * c.s), L.w, L.h); ctx.globalAlpha = 1; }
        });
        // Overcast: a grey veil over the sky
        if (g.overcastLvl > 0.01) {
          ctx.fillStyle = `rgba(118,128,148,${0.42 * g.overcastLvl})`;
          ctx.fillRect(0, 0, W, GROUND);
        }
        drawBirds(p);
        strip(layers.far, 0.05);
        strip(layers.mid, 0.1);
        strip(layers.forestBack, 0.22);
        strip(layers.hills, 0.4);
        strip(layers.forestFront, 0.55);
        strip(layers.ground, 1);
        if (g.overcastLvl > 0.01) {
          ctx.fillStyle = `rgba(60,70,90,${0.18 * g.overcastLvl})`;
          ctx.fillRect(0, GROUND - 160, W, H);
        }
        // Snow settles on the grass
        if (g.snowLvl > 0.01) {
          ctx.fillStyle = `rgba(240,246,255,${0.8 * g.snowLvl})`;
          ctx.fillRect(0, GROUND - 2, W, 5);
          ctx.fillStyle = `rgba(240,246,255,${0.25 * g.snowLvl})`;
          ctx.fillRect(0, GROUND + 3, W, 6);
        }
      }

      function drawBirds(p) {
        ctx.strokeStyle = rgba(p.trees, 0.8);
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (const b of g.birds) {
          const f = Math.sin(b.ph) * 4;
          ctx.beginPath();
          ctx.moveTo(b.x - 7, b.y - f);
          ctx.quadraticCurveTo(b.x - 3, b.y - 2, b.x, b.y);
          ctx.quadraticCurveTo(b.x + 3, b.y - 2, b.x + 7, b.y - f);
          ctx.stroke();
        }
      }

      function drawWeatherAndFlies(p) {
        if (p.night > 0.3) {
          for (const f of g.flies) {
            const a = Math.min(1, f.life) * (0.5 + 0.5 * Math.sin(f.ph * 5)) * p.night;
            const fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 7);
            fg.addColorStop(0, `rgba(230,255,140,${a})`);
            fg.addColorStop(1, 'rgba(230,255,140,0)');
            ctx.fillStyle = fg;
            ctx.fillRect(f.x - 7, f.y - 7, 14, 14);
          }
        }
        if (g.snow.length) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          for (const s of g.snow) { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, TAU); }
          ctx.fill();
        }
      }

      // ---------- Tux: side view, walking right ----------
      function drawTux(t) {
        if (t.hurt > 0 && Math.floor(t.hurt * 16) % 2 === 0) return;
        const walking = t.ground;
        const ph = t.step;
        const fA = walking ? Math.sin(ph) : 0;
        const fB = walking ? Math.sin(ph + Math.PI) : 0;
        const liftA = walking ? Math.max(0, Math.cos(ph)) * 4 : 0;
        const liftB = walking ? Math.max(0, Math.cos(ph + Math.PI)) * 4 : 0;
        const bob = walking ? -Math.abs(Math.sin(ph)) * 2.4 : 0;
        const waddle = walking ? Math.sin(ph) * 0.06 : 0;
        const X = t.x;

        const lift = Math.max(0, GROUND - t.y);
        ctx.fillStyle = `rgba(0,0,0,${0.25 * Math.max(0.25, 1 - lift / 140)})`;
        ctx.beginPath(); ctx.ellipse(X + 2, GROUND + 1, 17 * TUX_SCALE * Math.max(0.45, 1 - lift / 220), 3.5, 0, 0, TAU); ctx.fill();

        const frame = () => {
          ctx.translate(X, t.y);
          ctx.scale(TUX_SCALE * (1 + t.squash * 0.5), TUX_SCALE * (1 - t.squash));
          if (!t.ground) ctx.rotate(Math.max(-0.2, Math.min(0.25, t.vy / 2200)));
        };
        const foot = (dx, liftY, front) => {
          ctx.fillStyle = front ? '#ff9d1e' : '#d8770f';
          const fx = dx * 7 + 2;
          const fy = -liftY;
          ctx.beginPath(); ctx.roundRect(fx - 1.5, fy - 7, 3.2, 7, 1.5); ctx.fill();
          ctx.beginPath(); ctx.ellipse(fx + 3.5, fy - 1, 6.2, 2.6, 0, 0, TAU); ctx.fill();
        };
        const tucked = !t.ground;

        ctx.save();
        frame();
        foot(tucked ? -0.3 : fB, tucked ? 6 : liftB, false);
        ctx.translate(0, bob);
        ctx.rotate(0.08 + waddle);
        const bodyG = ctx.createRadialGradient(-6, -32, 4, 0, -20, 26);
        bodyG.addColorStop(0, '#3b3d4a');
        bodyG.addColorStop(1, '#0c0c12');
        ctx.fillStyle = bodyG;
        ctx.beginPath(); ctx.ellipse(0, -21, 15, 20, 0, 0, TAU); ctx.fill();
        const belly = ctx.createLinearGradient(0, -36, 0, -2);
        belly.addColorStop(0, '#ffffff');
        belly.addColorStop(1, '#d9dbe6');
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(5.5, -18, 9, 15.5, 0.08, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0c0c12';
        ctx.beginPath(); ctx.moveTo(-13, -8); ctx.lineTo(-19, -3); ctx.lineTo(-11, -3); ctx.fill();
        const headG = ctx.createRadialGradient(-2, -46, 2, 2, -40, 14);
        headG.addColorStop(0, '#3b3d4a');
        headG.addColorStop(1, '#0c0c12');
        ctx.fillStyle = headG;
        ctx.beginPath(); ctx.arc(3, -40, 11.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(8.5, -41, 4.6, 5.6, 0.15, 0, TAU); ctx.fill();
        if (t.hurt > 0) {
          ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(7, -43.5); ctx.lineTo(11, -39.5); ctx.moveTo(11, -43.5); ctx.lineTo(7, -39.5); ctx.stroke();
        } else if (t.blink < 0) {
          ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(7, -41); ctx.lineTo(11.5, -41); ctx.stroke();
        } else {
          ctx.fillStyle = '#111';
          ctx.beginPath(); ctx.arc(10, -41.5, 2.3, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(10.8, -42.4, 0.8, 0, TAU); ctx.fill();
        }
        const beak = ctx.createLinearGradient(12, -38, 22, -33);
        beak.addColorStop(0, '#ffb43b');
        beak.addColorStop(1, '#ff8a00');
        ctx.fillStyle = beak;
        ctx.beginPath(); ctx.moveTo(11, -38.5); ctx.quadraticCurveTo(19, -38, 23, -35); ctx.quadraticCurveTo(18, -33.5, 11, -33.5); ctx.fill();
        ctx.fillStyle = '#d96f00';
        ctx.beginPath(); ctx.moveTo(11, -35); ctx.quadraticCurveTo(17, -34.5, 21, -34.6); ctx.quadraticCurveTo(17, -32.5, 11, -32.5); ctx.fill();
        // flipper: swings while walking, flaps up in the air (bigger flaps, like the original)
        const swing = tucked ? -1.0 + Math.sin(ph * 2) * 0.4 : -fA * 0.45;
        ctx.save();
        ctx.translate(-3, -29);
        ctx.rotate(0.35 + swing);
        const fl = ctx.createLinearGradient(-4, 0, 4, 16);
        fl.addColorStop(0, '#1d1e27');
        fl.addColorStop(1, '#050508');
        ctx.fillStyle = fl;
        ctx.beginPath(); ctx.ellipse(0, 8, 4.2, 11, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.restore();

        ctx.save();
        frame();
        foot(tucked ? 0.4 : fA, tucked ? 4 : liftA, true);
        ctx.restore();

        if (t.sparkle > 0) {
          ctx.fillStyle = '#ffffff';
          const r = (0.3 - t.sparkle) * 70;
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * TAU;
            ctx.fillRect(X + Math.cos(a) * r - 1, t.y - 20 + Math.sin(a) * r * 0.6 - 1, 2, 2);
          }
        }
      }

      // ---------- Distro tiles (the original's dark tile with icon + name strip) ----------
      const itemCache = {};
      const measure = document.createElement('canvas').getContext('2d');
      // Largest font (10px down to 7px) at which the label fits the tile's name strip.
      function labelFont(label) {
        let px = 10;
        for (; px > 7; px -= 0.5) {
          measure.font = `600 ${px}px Inter, system-ui, sans-serif`;
          if (measure.measureText(label).width <= TILE - 12) break;
        }
        return `600 ${px}px Inter, system-ui, sans-serif`;
      }
      function itemSprite(name) {
        const key = `${name}@${scale}`;
        if (itemCache[key]) return itemCache[key];
        const img = iconImage(name);
        if (!img.complete || !img.naturalWidth) return null;
        const w = TILE;
        const h = TILE;
        const label = TILE_LABEL[name] || name;
        const L = paint(surface(w + 6, h + 8, -2), () => {
          ctx.translate(3, 0);
          ctx.shadowColor = 'rgba(0,0,0,0.35)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
          const bg = ctx.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#26304a');
          bg.addColorStop(1, '#161c2c');
          ctx.fillStyle = bg;
          ctx.beginPath(); ctx.roundRect(0, 0, w, h, 10); ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(0.5, 0.5, w - 1, h - 1, 9.5); ctx.stroke();
          // icon, fitted into the top area
          const iw = h - 26; const ih = h - 26;
          const k = Math.min(iw / img.naturalWidth, ih / img.naturalHeight);
          const dw = img.naturalWidth * k; const dh = img.naturalHeight * k;
          ctx.drawImage(img, (w - dw) / 2, 6 + (ih - dh) / 2, dw, dh);
          // name strip
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.roundRect(4, h - 16, w - 8, 12, 5); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = labelFont(label);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, w / 2, h - 9.5);
        });
        itemCache[key] = L;
        return L;
      }

      function drawItems() {
        for (const it of g.items) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.ellipse(snap(it.x + it.w / 2), GROUND + 1, it.w * 0.42, 3, 0, 0, TAU); ctx.fill();
          const s = itemSprite(it.name);
          if (s) ctx.drawImage(s.c, snap(it.x - 3), snap(it.y - 2), s.w, s.h);
        }
      }

      function draw() {
        ensureLayers();
        const pal = palette((g.dist / DAY_LEN) % 1);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        if (g.shake > 0) ctx.translate(snap((Math.random() - 0.5) * 8 * g.shake), snap((Math.random() - 0.5) * 8 * g.shake));
        drawScene(pal);
        drawItems();
        drawTux(g.tux);
        drawWeatherAndFlies(pal);
        for (const p of g.parts) {
          ctx.globalAlpha = Math.max(0, p.life / 0.6);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, TAU); ctx.fill();
        }
        ctx.font = '700 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const tx of g.texts) {
          ctx.globalAlpha = Math.max(0, Math.min(1, tx.life * 2));
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.strokeText(tx.text, tx.x, tx.y);
          ctx.fillStyle = tx.color;
          ctx.fillText(tx.text, tx.x, tx.y);
        }
        ctx.globalAlpha = 1;
        if (g.flash > 0) {
          ctx.fillStyle = `rgba(255,70,70,${g.flash * 0.6})`;
          ctx.fillRect(-10, -10, W + 20, H + 20);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.75 + pal.night * 0.25;
        ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }

      // ---------- Loop ----------
      function loop(now) {
        raf = null;
        if (!document.body.contains(canvas)) return;
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        if (screen === 'play' && (!win.el.classList.contains('active') || win.el.classList.contains('minimized'))) { userPaused = true; setPaused(true); }
        if (screen === 'play') update(dt);
        else if (screen === 'launch' || screen === 'pick' || screen === 'finish') { g.t += dt; g.dist += 40 * dt; g.tux.step += dt * 6; }
        if (screen !== 'paused') ambient(dt);
        draw();
        if (screen !== 'paused') raf = requestAnimationFrame(loop);
      }
      function kick() {
        if (raf) return;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }

      // ---------- Input ----------
      const keys = { left: false, right: false };
      let hTimer = null;
      win.el.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const k = e.key;
        if (k === 'm' || k === 'M') { e.preventDefault(); if (!e.repeat && !mapHeld) { mapHeld = true; showMap(true); } return; }
        if (k === 'h' || k === 'H') { if (!hTimer) hTimer = setTimeout(openSecret, 3000); return; }
        if (k === 'Enter' && screen === 'launch') { e.preventDefault(); play(); return; }
        if (k === 'Escape' && mapView.classList.contains('show')) { showMap(false); return; }
        if (k === 'r' || k === 'R') { toLaunch(); return; }
        if (k === 'p' || k === 'P') { togglePause(); return; }
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; if (screen === 'play') e.preventDefault(); }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; if (screen === 'play') e.preventDefault(); }
        if ((k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') && screen === 'play') {
          e.preventDefault();
          if (!e.repeat) { g.tux.buffer = 0.12; g.tux.held = true; }
        }
      });
      win.el.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'm' || k === 'M') { mapHeld = false; showMap(false); }
        if (k === 'h' || k === 'H') { clearTimeout(hTimer); hTimer = null; }
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
        if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') g.tux.held = false;
      });
      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        canvas.focus();
        Sound.init();
        if (screen === 'play') { g.tux.buffer = 0.12; g.tux.held = true; }
      });
      const release = () => { g.tux.held = false; };
      canvas.addEventListener('pointerup', release);
      canvas.addEventListener('pointercancel', release);

      // ---------- Secret: hold H for 3 s, then type the password ----------
      function openSecret() {
        hTimer = null;
        const prev = { cls: overlay.className, kids: [...overlay.childNodes] };
        const wasPlaying = screen === 'play';
        if (wasPlaying) setPaused(true, true);
        const input = el('input', { class: 'kd-secret', type: 'password', autocomplete: 'off', 'aria-label': 'Password' });
        const close = () => { overlay.className = prev.cls; overlay.replaceChildren(...prev.kids); if (wasPlaying) setPaused(false, true); };
        input.addEventListener('input', () => {
          const v = input.value.trim();
          const pass = 'ecoholic';
          if (v === pass) {
            showcase = !showcase;
            OS.achievements.unlock('runner_secret');
            OS.toast({ icon: '🐧', title: showcase ? 'Showcase mode on' : 'Showcase mode off', body: showcase ? 'Tux plays by himself. Hold H again to turn it off.' : '' });
            updateHud();
            close();
          } else if (pass.startsWith(v)) input.classList.remove('invalid');
          else { input.classList.add('invalid'); input.value = ''; }
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); e.stopPropagation(); });
        showOverlay('secret', input);
        input.focus();
      }

      // ---------- Sizing ----------
      function resize() {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        if (!w || !h) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const zoom = Math.max(0.75, Math.min(1.1, h / 600));
        scale = dpr * zoom;
        const oldW = W;
        const oldGround = GROUND;
        W = w / zoom;
        H = h / zoom;
        GROUND = H - Math.max(56, H * 0.13);
        if (g) {
          g.tux.y += GROUND - oldGround;
          g.tux.x *= W / oldW;
          for (const it of g.items) it.y += GROUND - oldGround;
        }
        vignette.width = Math.ceil(w / 4);
        vignette.height = Math.ceil(h / 4);
        const vx = vignette.getContext('2d');
        const vg = vx.createRadialGradient(vignette.width / 2, vignette.height * 0.55, Math.min(vignette.width, vignette.height) * 0.35, vignette.width / 2, vignette.height * 0.55, Math.max(vignette.width, vignette.height) * 0.8);
        vg.addColorStop(0, 'rgba(0,0,20,0)');
        vg.addColorStop(1, 'rgba(0,0,20,0.32)');
        vx.fillStyle = vg;
        vx.fillRect(0, 0, vignette.width, vignette.height);
        layers.sky = null;
        for (const k of Object.keys(itemCache)) delete itemCache[k];
        if (!stars.length) stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() ** 1.4, r: Math.random() < 0.15 ? 1.8 : 1, a: 0.5 + Math.random() * 0.5, tw: 1 + Math.random() * 3, ph: Math.random() * 6 }));
        if (g) draw();
      }
      const ro = new ResizeObserver(resize);
      ro.observe(stage);
      win.onClose(() => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); raf = null; clearTimeout(hTimer); });

      // Name strips are baked into sprites; re-bake once the web font has loaded.
      document.fonts?.ready.then(() => { for (const k of Object.keys(itemCache)) delete itemCache[k]; });

      newWorld();
      updateHud();
      renderLaunch();
      requestAnimationFrame(() => { resize(); kick(); });

      return {
        focus: () => canvas.focus(),
        resized: resize,
        debug: () => ({
          get g() { return g; }, get screen() { return screen; }, get score() { return score; }, get total() { return total; },
          get lives() { return lives; }, get team() { return team; }, get mode() { return mode; }, get rapidScores() { return rapidScores; },
          chooseTeam, play, setMode, speedMultiplier, spawnTile,
        }),
      };
    },
  });
})();
