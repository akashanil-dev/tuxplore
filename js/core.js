'use strict';
// Core: global namespace, event bus, save state, DOM helpers, toasts, achievements.

const OS = (window.OS = {});

OS.bus = (() => {
  const handlers = {};
  return {
    on(evt, fn) { (handlers[evt] ||= []).push(fn); },
    off(evt, fn) { handlers[evt] = (handlers[evt] || []).filter((f) => f !== fn); },
    emit(evt, data) { (handlers[evt] || []).slice().forEach((fn) => fn(data)); },
  };
})();

OS.util = {
  // el('div', {class: 'x', onclick: fn}, 'text', childNode)
  el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (val == null || val === false) continue;
      if (key === 'class') node.className = val;
      else if (key === 'text') node.textContent = val;
      else if (key === 'html') node.innerHTML = val;
      else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), val);
      else node.setAttribute(key, val === true ? '' : val);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : String(child));
    }
    return node;
  },
  escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
  reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
};

// ---------- Save state ----------
const SAVE_KEY = 'tuxos-save-v1';

function defaultState() {
  return {
    username: null,
    theme: 'gnome',
    wallpaper: 'aurora',
    fastBoot: false,
    unlockedThemes: ['gnome'],
    achievements: {},
    learned: {},
    quests: { done: {}, progress: {} },
    pipe: { solved: {} },
    runner: { best: 0, family: 'debian' },
    installed: {},
    history: [],
    fs: null,
  };
}

OS.state = (() => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return defaultState();
})();

OS.save = () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(OS.state)); } catch { /* ignore */ }
};

OS.resetSave = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.reload();
};

// ---------- Toasts ----------
OS.toast = ({ icon = '🐧', title, body = '', timeout = 4500 }) => {
  const host = document.getElementById('toasts');
  if (!host) return;
  const { el } = OS.util;
  const t = el('div', { class: 'toast', role: 'status' },
    el('div', { class: 'toast-icon', text: icon }),
    el('div', { class: 'toast-text' }, el('strong', { text: title }), body && el('span', { text: body })));
  host.append(t);
  // Keep the stack short when lots of things unlock at once.
  while (host.children.length > 4) host.firstElementChild.remove();
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, timeout);
};

// ---------- Achievements ----------
OS.achievements = {
  list: [
    { id: 'first_boot', icon: '🔌', name: 'It Boots!', desc: 'Boot TuxOS for the first time.' },
    { id: 'first_cmd', icon: '⌨️', name: 'Hello, Shell', desc: 'Run your first terminal command.' },
    { id: 'ten_cmds', icon: '🧠', name: 'Command Collector', desc: 'Learn 10 different commands.' },
    { id: 'twenty_cmds', icon: '📚', name: 'Walking Manpage', desc: 'Learn 25 different commands.' },
    { id: 'first_pipe', icon: '🔧', name: 'Plumber', desc: 'Use a pipe | to chain two commands.' },
    { id: 'sudo_lecture', icon: '🛡️', name: 'With Great Power', desc: 'Use sudo for the first time.' },
    { id: 'quest_half', icon: '🗺️', name: 'Adventurer', desc: 'Complete 5 quests.' },
    { id: 'quest_all', icon: '👑', name: 'Root of All Things', desc: 'Complete every quest.' },
    { id: 'pipe_all', icon: '🚰', name: 'Master Plumber', desc: 'Solve every Pipe Dream level.' },
    { id: 'runner_play', icon: '🏃', name: 'Tux on the Run', desc: 'Play a round of Know Your Distro.' },
    { id: 'runner_500', icon: '🔥', name: 'Speedrunner', desc: 'Score 500 points with one team in Know Your Distro.' },
    { id: 'runner_combo', icon: '✨', name: 'Family Reunion', desc: 'Pick 10 of your team\'s distros in a row in Know Your Distro.' },
    { id: 'runner_map', icon: '🗺️', name: 'Cartographer', desc: 'Open the distro family map in Know Your Distro.' },
    { id: 'runner_rapid', icon: '🏁', name: 'Three for Three', desc: 'Finish all three rounds of Rapid mode.' },
    { id: 'theme_switch', icon: '🎨', name: 'Ricer', desc: 'Switch your desktop theme.' },
    { id: 'files_terminal', icon: '🌉', name: 'Bridge Builder', desc: 'Open a terminal from the file manager.' },
    { id: 'installer', icon: '💿', name: 'Ready for the Real Thing', desc: 'Find your distro in the installer.' },
    // Hidden ones
    { id: 'rm_rf', icon: '💥', name: 'You Monster', desc: 'Run sudo rm -rf / (please never do this for real).', hidden: true },
    { id: 'vim_escape', icon: '🚪', name: 'I Escaped Vim', desc: 'Get out of vim.', hidden: true },
    { id: 'sl', icon: '🚂', name: 'Choo Choo', desc: 'Mistype ls as sl.', hidden: true },
    { id: 'cowsay', icon: '🐮', name: 'Moo', desc: 'Make the cow say something.', hidden: true },
    { id: 'fortune', icon: '🥠', name: 'Fortune Teller', desc: 'Ask for your fortune.', hidden: true },
    { id: 'matrix', icon: '🟩', name: 'Wake Up, Neo', desc: 'Enter the matrix.', hidden: true },
    { id: 'konami', icon: '🕹️', name: 'Up Up Down Down', desc: 'Enter the Konami code.', hidden: true },
    { id: 'memtest', icon: '🧪', name: 'Memory Lane', desc: 'Run memtest from the GRUB menu.', hidden: true },
    { id: 'recovery', icon: '🩹', name: 'Safe Mode', desc: 'Boot into recovery mode.', hidden: true },
    { id: 'sandwich', icon: '🥪', name: 'Okay.', desc: 'Make yourself a sandwich.', hidden: true },
    { id: 'daemon', icon: '🗡️', name: 'Daemon Slayer', desc: 'Kill the segfault daemon.', hidden: true },
    { id: 'runner_secret', icon: '🎪', name: 'Showtime', desc: 'Find the secret showcase mode in Know Your Distro.', hidden: true },
    { id: 'windows_habit', icon: '🪟', name: 'Old Habits', desc: 'Type a Windows command in the terminal.', hidden: true },
  ],
  get(id) { return this.list.find((a) => a.id === id); },
  has(id) { return !!OS.state.achievements[id]; },
  unlock(id) {
    if (this.has(id)) return;
    const a = this.get(id);
    if (!a) return;
    OS.state.achievements[id] = Date.now();
    OS.save();
    OS.toast({ icon: a.icon, title: 'Achievement unlocked', body: a.name });
    OS.bus.emit('achievement', a);
  },
};

// ---------- Themes ----------
OS.themes = [
  { id: 'gnome', name: 'GNOME style', desc: 'Clean, rounded and calm.', unlock: 'Unlocked from the start' },
  { id: 'kde', name: 'KDE Plasma style', desc: 'Breeze blues and sharp edges.', unlock: 'Complete quest 3: Into the Dungeon' },
  { id: 'retro', name: 'Retro CDE', desc: 'Unix workstations, circa 1995.', unlock: 'Complete quest 6: Goblin Trouble' },
  { id: 'tiling', name: 'Tiling (Hyprland style)', desc: 'Windows arrange themselves. Gaps included.', unlock: 'Complete every quest' },
];

OS.wallpapers = {
  aurora: 'radial-gradient(ellipse at 20% 20%, #3b82f6 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, #a855f7 0%, transparent 55%), linear-gradient(160deg, #0f172a, #1e1b4b)',
  sunset: 'linear-gradient(160deg, #f97316 0%, #db2777 45%, #4c1d95 100%)',
  forest: 'radial-gradient(ellipse at 70% 10%, #84cc16 0%, transparent 45%), linear-gradient(170deg, #14532d, #052e16)',
  ocean: 'radial-gradient(ellipse at 30% 80%, #06b6d4 0%, transparent 50%), linear-gradient(200deg, #0c4a6e, #082f49)',
  terminal: 'repeating-linear-gradient(0deg, rgba(0,255,100,0.04) 0 2px, transparent 2px 4px), #0a0f0a',
};

OS.unlockTheme = (id) => {
  if (OS.state.unlockedThemes.includes(id)) return;
  OS.state.unlockedThemes.push(id);
  OS.save();
  const theme = OS.themes.find((t) => t.id === id);
  OS.toast({ icon: '🎨', title: 'New theme unlocked', body: `${theme.name}. Try it in Settings.` });
};

OS.applyTheme = (id) => {
  document.body.dataset.theme = id;
  OS.state.theme = id;
  OS.save();
  OS.bus.emit('theme', id);
};

OS.applyWallpaper = (id) => {
  const desktop = document.getElementById('desktop');
  if (desktop) desktop.style.setProperty('--wallpaper', OS.wallpapers[id] || OS.wallpapers.aurora);
  OS.state.wallpaper = id;
  OS.save();
};

// Commands the player has run successfully feed the cheat sheet.
OS.learn = (cmd) => {
  if (OS.state.learned[cmd]) return;
  OS.state.learned[cmd] = Date.now();
  OS.save();
  const n = Object.keys(OS.state.learned).length;
  if (n >= 1) OS.achievements.unlock('first_cmd');
  if (n >= 10) OS.achievements.unlock('ten_cmds');
  if (n >= 25) OS.achievements.unlock('twenty_cmds');
  OS.bus.emit('learned', cmd);
};
