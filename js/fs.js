'use strict';
// Virtual filesystem. Nodes are plain objects so the whole tree can be saved as JSON:
//   dir:  { t: 'd', o: owner, m: '755', ch: { name: node } }
//   file: { t: 'f', o: owner, m: '644', c: 'content', run?: 'scriptAction' }
// Owner is 'user' (the player) or 'root'. Group bits are ignored to keep things simple.

class FsError extends Error {}

const F = (c, extra = {}) => ({ t: 'f', o: 'user', m: '644', c, ...extra });
const D = (ch = {}, extra = {}) => ({ t: 'd', o: 'user', m: '755', ch, ...extra });
const RF = (c, extra = {}) => F(c, { o: 'root', ...extra });
const RD = (ch = {}, extra = {}) => D(ch, { o: 'root', ...extra });

const LIBRARY_BOOKS = [
  ['the-first-penguin.txt', 'Long ago, in 1991, a student named Linus wrote a small kernel.\nHe said it was "just a hobby, won\'t be big and professional".\nToday it runs phones, servers, cars and even the International Space Station.'],
  ['on-sharing.txt', 'Richard Stallman began the GNU project in 1983.\nHe believed software should respect the people who use it.\nGNU tools plus the Linux kernel made a complete, free operating system.'],
  ['bestiary.txt', 'GOBLIN: small, grumpy, lives in files. Weak against rm.\nDAEMON: a background process. Most are friendly. One is not.\nZOMBIE: a process that finished but whose parent never noticed.'],
  ['recipes.txt', 'Penguin stew: do not make penguin stew.\nFish tacos: preferred by penguins everywhere.\nCoffee: required by system administrators.'],
  ['the-four-freedoms.txt', 'Free software grants four freedoms:\n0. Run the program for any purpose.\n1. Study how it works and change it.\n2. Share copies with others.\n3. Share your improved versions.\nThe secret word for the gate is: freedom'],
  ['distros.txt', 'A distribution, or distro, is the Linux kernel bundled with tools and apps.\nDebian, Fedora and Arch are families. Ubuntu and Mint grew from Debian.\nThere are hundreds of them, and that is a feature.'],
  ['poetry.txt', 'Roses are red,\nterminals are black,\ntype rm -rf /\nand there is no way back.'],
  ['maps-and-paths.txt', 'Paths that start with / are absolute: they start at the root.\nPaths without / are relative: they start where you are.\n.. means the parent directory. ~ means your home.'],
  ['lost-and-found.txt', 'Nothing to see here. The good stuff is elsewhere.\nTry searching instead of reading every single book.'],
  ['the-shell.txt', 'The shell reads what you type and runs programs.\nBash is the most common one. Zsh and fish are popular too.\nPress Tab to autocomplete. Press Up to repeat a command.'],
  ['dragons.txt', 'There are no dragons in this library.\nThere is, however, a very old printer that jams constantly.'],
  ['permissions.txt', 'Every file has permissions: read (r), write (w) and execute (x).\nA script cannot run unless it has x. chmod +x adds it.\nType ls -l to see permissions.'],
];

const SYSLOG_LINES = (() => {
  const services = ['NetworkManager', 'systemd', 'sshd', 'cron', 'kernel', 'pulseaudio', 'bluetoothd', 'nginx'];
  const levels = ['INFO', 'INFO', 'INFO', 'WARN', 'INFO', 'ERROR', 'INFO', 'INFO', 'WARN', 'INFO', 'ERROR', 'INFO', 'INFO', 'INFO', 'ERROR', 'INFO', 'WARN', 'INFO', 'INFO', 'ERROR', 'INFO', 'INFO', 'INFO', 'ERROR', 'INFO', 'ERROR', 'INFO', 'WARN', 'INFO', 'INFO'];
  const msgs = {
    INFO: ['started successfully', 'connection established', 'job completed', 'device connected', 'configuration reloaded'],
    WARN: ['disk usage above 80%', 'slow response from upstream', 'retrying connection'],
    ERROR: ['segmentation fault (core dumped)', 'failed to bind port 80', 'permission denied', 'out of goblin repellent'],
  };
  return levels.map((lvl, i) => {
    const time = `09:${String(10 + i).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`;
    const svc = services[i % services.length];
    const msg = msgs[lvl][i % msgs[lvl].length];
    return `Oct 08 ${time} tuxos ${svc}: ${lvl} ${msg}`;
  });
})();

function buildTree(user) {
  const books = Object.fromEntries(LIBRARY_BOOKS.map(([name, text]) => [name, F(text)]));
  return RD({
    bin: RD({}),
    boot: RD({ 'vmlinuz-6.10-tuxos': RF('\x7fELF... (this is the Linux kernel. It is binary, not text.)') }),
    dev: RD({ null: RF('', { m: '666' }), random: RF('4\n8\n15\n16\n23\n42') }),
    etc: RD({
      hostname: RF('tuxos'),
      'os-release': RF('NAME="TuxOS"\nPRETTY_NAME="TuxOS 1.0 (Curious Penguin)"\nID=tuxos\nID_LIKE=debian\nHOME_URL="https://kernel.org"'),
      motd: RF('Welcome to TuxOS! Type "help" to see what you can do.'),
      passwd: RF(`root:x:0:0:root:/root:/bin/bash\n${user}:x:1000:1000:${user}:/home/${user}:/bin/bash\ntux:x:1001:1001:Tux the Penguin:/home/tux:/bin/bash`),
      shadow: RF('root:$6$nice.try$...\n(passwords are stored hashed, and only root may read this file)', { m: '600' }),
    }),
    home: RD({
      [user]: D({
        'welcome.txt': F(
          `Hi ${user},\n\nI'm Tux, the Linux penguin. I need your help!\n\n` +
          'The Segfault Daemon stole my Kernel Crown and hid it somewhere\n' +
          'deep inside this computer. Only someone who knows the terminal\n' +
          'can get it back.\n\n' +
          'Start by going into the dungeon:   cd dungeon\n' +
          'Then look around with:             ls\n\n' +
          'Good luck!\n  - Tux 🐧'),
        Documents: D({
          'linux-facts.txt': F('Linux runs on all of the top 500 supercomputers.\nAndroid is built on the Linux kernel.\nThe mascot Tux was drawn by Larry Ewing in 1996.\nLinux is free: free as in price, and free as in freedom.'),
          'todo.txt': F('- learn the terminal\n- rescue the crown\n- tell friends about Linux'),
          'about-tuxplore.txt': F('TUXPLORE\n========\n\nYou are playing Tuxplore: a game that teaches Linux by letting you use it.\nTuxOS, the system you are in now, is pretend, but the commands are real.\n\nWhat it is, what you will learn, and the FAQ:\n  https://tuxplore.akashanil.dev/about.html\n\nPublic usage stats:\n  https://tuxplore.akashanil.dev/stats.html\n\nMade by Akash A.  Liked it? Tell a friend who is curious about Linux.'),
        }),
        Pictures: D({ 'tux.txt': F('     .--.\n    |o_o |\n    |:_/ |\n   //   \\ \\\n  (|     | )\n /\'\\_   _/`\\\n \\___)=(___/') }),
        Music: D({}),
        dungeon: D({
          'README.txt': F('Welcome to the Dungeon.\n\nAdventurers who only look at the obvious miss the most important things.\nIn Linux, hidden files start with a dot.\n\nTry:  ls -a'),
          '.map': F(
            'THE MAP\n=======\n\n' +
            'The gate to the crypt needs a secret word.\n' +
            'The word is written in one of the books in library/.\n\n' +
            'There are too many books to read one by one.\n' +
            'Search them all at once:   grep -r secret library\n\n' +
            'Then open the gate:        ./gate.sh <the-secret-word>'),
          library: D(books),
          'gate.sh': F('#!/bin/bash\n# Opens the gate to the crypt.\n# Usage: ./gate.sh <secret-word>', { run: 'gate' }),
        }),
      }),
      tux: D({ 'diary.txt': F('Dear diary, someone took my crown. I am very sad. I ate a fish. I feel better.') }, { o: 'root', m: '755' }),
    }),
    proc: RD({
      cpuinfo: RF('processor\t: 0\nmodel name\t: Imaginary Penguin CPU @ 4.20GHz\ncores\t\t: 8'),
      uptime: RF('1337.42 2048.00'),
    }),
    root: RD({
      'crown.txt': RF(
        '      _.+._\n    (^\\/^\\/^)\n     \\@*@*@/\n     {_____}\n\n' +
        'THE KERNEL CROWN\n\nYou found it! Only the superuser could read this file.\n' +
        'Claim it: make a trophies folder in your home and copy me there.\n' +
        '  mkdir ~/trophies\n  sudo cp /root/crown.txt ~/trophies/', { m: '600' }),
    }, { m: '700' }),
    tmp: RD({}, { m: '777' }),
    usr: RD({ bin: RD({}), share: RD({ doc: RD({ 'README': RF('Documentation lives here. In the terminal, use man <command>.') }) }) }),
    var: RD({ log: RD({ syslog: RF(SYSLOG_LINES.join('\n')) }) }),
  });
}

OS.fs = {
  FsError,
  root: null,
  user: null,

  init(user) {
    this.user = user;
    this.root = OS.state.fs || buildTree(user);
    this.persist();
  },

  reset() {
    this.root = buildTree(this.user);
    this.persist();
  },

  persist() {
    OS.state.fs = this.root;
    OS.save();
    OS.bus.emit('fs:change');
  },

  home() { return `/home/${this.user}`; },

  // Turn any path into a normalised absolute path.
  resolve(path, cwd = this.home()) {
    if (path === '~' || path.startsWith('~/')) path = this.home() + path.slice(1);
    const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/');
    const out = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return '/' + out.join('/');
  },

  // Show home as ~ in prompts.
  pretty(abs) {
    const h = this.home();
    if (abs === h) return '~';
    if (abs.startsWith(h + '/')) return '~' + abs.slice(h.length);
    return abs;
  },

  lookup(abs) {
    let node = this.root;
    for (const part of abs.split('/').filter(Boolean)) {
      if (!node || node.t !== 'd') return null;
      node = node.ch[part];
    }
    return node || null;
  },

  split(abs) {
    const idx = abs.lastIndexOf('/');
    return [abs.slice(0, idx) || '/', abs.slice(idx + 1)];
  },

  bits(node) {
    return parseInt(node.m[node.o === 'user' ? 0 : 2], 8);
  },
  canRead(node, sudo) { return sudo || (this.bits(node) & 4) !== 0; },
  canWrite(node, sudo) { return sudo || (this.bits(node) & 2) !== 0; },
  canExec(node, sudo) { return sudo || (this.bits(node) & 1) !== 0; },

  must(abs) {
    const node = this.lookup(abs);
    if (!node) throw new FsError('No such file or directory');
    return node;
  },

  list(abs, sudo) {
    const node = this.must(abs);
    if (node.t !== 'd') throw new FsError('Not a directory');
    if (!this.canRead(node, sudo)) throw new FsError('Permission denied');
    return Object.keys(node.ch).sort((a, b) => a.replace(/^\./, '').localeCompare(b.replace(/^\./, '')));
  },

  read(abs, sudo) {
    const node = this.must(abs);
    if (node.t === 'd') throw new FsError('Is a directory');
    if (!this.canRead(node, sudo)) throw new FsError('Permission denied');
    OS.bus.emit('fs:read', { path: abs, sudo });
    return node.c;
  },

  write(abs, content, { append = false, sudo = false } = {}) {
    if (abs === '/dev/null') return;
    const existing = this.lookup(abs);
    if (existing) {
      if (existing.t === 'd') throw new FsError('Is a directory');
      if (!this.canWrite(existing, sudo)) throw new FsError('Permission denied');
      existing.c = append && existing.c ? `${existing.c}\n${content}` : content;
    } else {
      const [dir, name] = this.split(abs);
      const parent = this.must(dir);
      if (parent.t !== 'd') throw new FsError('Not a directory');
      if (!this.canWrite(parent, sudo)) throw new FsError('Permission denied');
      parent.ch[name] = { t: 'f', o: this.ownerFor(dir), m: '644', c: content };
    }
    this.persist();
  },

  // Files created inside the player's home belong to the player, even under sudo.
  ownerFor(dir) {
    return dir === this.home() || dir.startsWith(this.home() + '/') || dir === '/tmp' ? 'user' : 'root';
  },

  mkdir(abs, { parents = false, sudo = false } = {}) {
    if (this.lookup(abs)) {
      if (parents) return;
      throw new FsError('File exists');
    }
    const [dir, name] = this.split(abs);
    if (!this.lookup(dir)) {
      if (!parents) throw new FsError('No such file or directory');
      this.mkdir(dir, { parents, sudo });
    }
    const parent = this.must(dir);
    if (parent.t !== 'd') throw new FsError('Not a directory');
    if (!this.canWrite(parent, sudo)) throw new FsError('Permission denied');
    parent.ch[name] = { t: 'd', o: this.ownerFor(dir), m: '755', ch: {} };
    this.persist();
  },

  remove(abs, { recursive = false, sudo = false, dirOnly = false } = {}) {
    if (abs === '/') throw new FsError('Permission denied');
    const node = this.must(abs);
    if (node.t === 'd' && !recursive && !dirOnly) throw new FsError('Is a directory');
    if (dirOnly && node.t !== 'd') throw new FsError('Not a directory');
    if (dirOnly && Object.keys(node.ch).length) throw new FsError('Directory not empty');
    const [dir, name] = this.split(abs);
    const parent = this.must(dir);
    if (!this.canWrite(parent, sudo)) throw new FsError('Permission denied');
    delete parent.ch[name];
    this.persist();
  },

  copy(src, dst, { recursive = false, sudo = false } = {}) {
    const node = this.must(src);
    if (node.t === 'd' && !recursive) throw new FsError('Is a directory (try cp -r)');
    if (!this.canRead(node, sudo)) throw new FsError('Permission denied');
    const target = this.lookup(dst);
    if (target && target.t === 'd') dst = `${dst === '/' ? '' : dst}/${this.split(src)[1]}`;
    const [dir, name] = this.split(dst);
    const parent = this.must(dir);
    if (parent.t !== 'd') throw new FsError('Not a directory');
    if (!this.canWrite(parent, sudo)) throw new FsError('Permission denied');
    const clone = JSON.parse(JSON.stringify(node));
    const owner = this.ownerFor(dir);
    (function chown(n) { n.o = owner; if (n.t === 'd') Object.values(n.ch).forEach(chown); })(clone);
    parent.ch[name] = clone;
    if (node.t === 'f') OS.bus.emit('fs:read', { path: src, sudo });
    this.persist();
    return dst;
  },

  move(src, dst, { sudo = false } = {}) {
    if (src === '/') throw new FsError('Permission denied');
    const node = this.must(src);
    const [srcDir, srcName] = this.split(src);
    if (!this.canWrite(this.must(srcDir), sudo)) throw new FsError('Permission denied');
    const target = this.lookup(dst);
    if (target && target.t === 'd') dst = `${dst === '/' ? '' : dst}/${srcName}`;
    if (dst === src || dst.startsWith(src + '/')) throw new FsError('Cannot move a directory into itself');
    const [dir, name] = this.split(dst);
    const parent = this.must(dir);
    if (parent.t !== 'd') throw new FsError('Not a directory');
    if (!this.canWrite(parent, sudo)) throw new FsError('Permission denied');
    delete this.must(srcDir).ch[srcName];
    parent.ch[name] = node;
    this.persist();
    return dst;
  },

  chmod(abs, mode, { sudo = false } = {}) {
    const node = this.must(abs);
    if (node.o !== 'user' && !sudo) throw new FsError('Operation not permitted');
    let digits = node.m.split('').map(Number);
    if (/^[0-7]{3}$/.test(mode)) {
      digits = mode.split('').map(Number);
    } else {
      const m = mode.match(/^([ugoa]*)([+-=])([rwx]+)$/);
      if (!m) throw new FsError(`invalid mode: '${mode}'`);
      const who = m[1] || 'a';
      const mask = (m[3].includes('r') ? 4 : 0) | (m[3].includes('w') ? 2 : 0) | (m[3].includes('x') ? 1 : 0);
      const idx = [];
      if (/[ua]/.test(who)) idx.push(0);
      if (/[ga]/.test(who)) idx.push(1);
      if (/[oa]/.test(who)) idx.push(2);
      for (const i of idx) {
        if (m[2] === '+') digits[i] |= mask;
        else if (m[2] === '-') digits[i] &= ~mask;
        else digits[i] = mask;
      }
    }
    node.m = digits.join('');
    this.persist();
  },

  modeString(node) {
    const triad = (d) => (d & 4 ? 'r' : '-') + (d & 2 ? 'w' : '-') + (d & 1 ? 'x' : '-');
    return (node.t === 'd' ? 'd' : '-') + node.m.split('').map(Number).map(triad).join('');
  },

  // Expand a glob like 'goblins/*' or '*.txt' against the tree. Only the last path segment may contain wildcards.
  glob(pattern, cwd) {
    if (!/[*?]/.test(pattern)) return [pattern];
    const slash = pattern.lastIndexOf('/');
    const dirPart = slash >= 0 ? pattern.slice(0, slash + 1) : '';
    const namePart = pattern.slice(slash + 1);
    const dirAbs = this.resolve(dirPart || '.', cwd);
    const node = this.lookup(dirAbs);
    if (!node || node.t !== 'd') return [pattern];
    const re = new RegExp('^' + namePart.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const matches = Object.keys(node.ch)
      .filter((n) => re.test(n) && (!n.startsWith('.') || namePart.startsWith('.')))
      .sort()
      .map((n) => dirPart + n);
    return matches.length ? matches : [pattern];
  },
};
