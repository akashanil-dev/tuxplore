'use strict';
// A small bash-like shell over the virtual filesystem: quoting, $VARS, ~, globs, pipes,
// redirection (> >> <), && and ;. Commands live in OS.commands.

(() => {
  const { FsError } = OS.fs;
  const { UsageError, parseFlags, toLines } = OS.text;
  const esc = OS.util.escape;

  class ShellError extends Error {}

  // ---------- Tokenizer ----------
  function tokenize(line, env) {
    const tokens = [];
    let word = null; // { v, glob, quoted }
    const pushWord = () => { if (word) tokens.push({ t: 'w', ...word }); word = null; };
    const ensure = () => (word ||= { v: '', glob: false, quoted: false });
    let i = 0;
    const readVar = () => {
      let name = '';
      if (line[i + 1] === '{') {
        const end = line.indexOf('}', i);
        name = line.slice(i + 2, end);
        i = end;
      } else {
        while (/[A-Za-z0-9_?]/.test(line[i + 1] || '')) name += line[++i];
      }
      return name ? (env[name] ?? '') : '$';
    };
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === "'") {
        ensure().quoted = true;
        const end = line.indexOf("'", i + 1);
        if (end < 0) throw new ShellError('unexpected EOF while looking for matching `\'\'');
        word.v += line.slice(i + 1, end);
        i = end;
      } else if (c === '"') {
        ensure().quoted = true;
        i++;
        while (i < line.length && line[i] !== '"') {
          if (line[i] === '\\' && /["\\$]/.test(line[i + 1])) word.v += line[++i];
          else if (line[i] === '$') word.v += readVar();
          else word.v += line[i];
          i++;
        }
        if (i >= line.length) throw new ShellError('unexpected EOF while looking for matching `""');
      } else if (c === '\\') {
        ensure().v += line[++i] ?? '';
      } else if (c === '$') {
        ensure().v += readVar();
      } else if (/\s/.test(c)) {
        pushWord();
      } else if (c === '|' || c === ';' || c === '<' || c === '>' || c === '&') {
        pushWord();
        const two = line.slice(i, i + 2);
        if (two === '>>' || two === '&&' || two === '||') { tokens.push({ t: 'op', v: two }); i++; }
        else if (c === '&') throw new ShellError('background jobs (&) are not supported here');
        else tokens.push({ t: 'op', v: c });
      } else if (c === '~' && !word && (line[i + 1] === undefined || /[\s/]/.test(line[i + 1]))) {
        ensure().v += env.HOME;
      } else {
        ensure();
        if (c === '*' || c === '?') word.glob = true;
        word.v += c;
      }
    }
    pushWord();
    return tokens;
  }

  // Split tokens into [{ op: ';' | '&&' | '||', pipeline: [{ words, redirs }] }]
  function parse(tokens) {
    const lists = [];
    let pipeline = [];
    let cmd = { words: [], redirs: [] };
    let joiner = ';';
    const endCmd = () => {
      if (!cmd.words.length && !cmd.redirs.length) throw new ShellError('syntax error near unexpected token');
      pipeline.push(cmd);
      cmd = { words: [], redirs: [] };
    };
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.t === 'w') { cmd.words.push(tok); continue; }
      if (tok.v === '>' || tok.v === '>>' || tok.v === '<') {
        const target = tokens[++i];
        if (!target || target.t !== 'w') throw new ShellError(`syntax error near unexpected token \`${tok.v}'`);
        cmd.redirs.push({ op: tok.v, file: target.v });
      } else if (tok.v === '|') {
        endCmd();
      } else {
        endCmd();
        lists.push({ op: joiner, pipeline });
        pipeline = [];
        joiner = tok.v;
      }
    }
    if (cmd.words.length || cmd.redirs.length) endCmd();
    if (pipeline.length) lists.push({ op: joiner, pipeline });
    return lists;
  }

  // ---------- Suggestions for unknown commands ----------
  const WINDOWS = {
    dir: 'ls', cls: 'clear', copy: 'cp', move: 'mv', del: 'rm', erase: 'rm', type: 'cat', md: 'mkdir',
    rd: 'rmdir', ren: 'mv', ipconfig: 'ip a', tasklist: 'ps', taskkill: 'kill', notepad: 'nano',
    explorer: 'xdg-open .', ver: 'uname -a', findstr: 'grep', where: 'which', chdir: 'cd',
  };
  const INSTALLABLE = ['cowsay', 'cmatrix', 'lolcat'];

  function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  // ---------- Shell ----------
  class Shell {
    constructor(term, cwd) {
      this.term = term;
      this.cwd = cwd || OS.fs.home();
      this.prevCwd = this.cwd;
      this.lastCode = 0;
    }

    get env() {
      return {
        USER: OS.fs.user, HOME: OS.fs.home(), PWD: this.cwd, SHELL: '/bin/bash', HOSTNAME: 'tuxos',
        PATH: '/usr/local/bin:/usr/bin:/bin', TERM: 'xterm-256color', '?': String(this.lastCode),
      };
    }

    prompt() {
      return { user: OS.fs.user, host: 'tuxos', path: OS.fs.pretty(this.cwd) };
    }

    async exec(line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      OS.state.history.push(trimmed);
      if (OS.state.history.length > 300) OS.state.history.shift();
      OS.save();

      let lists;
      try {
        lists = parse(tokenize(trimmed, this.env));
      } catch (e) {
        if (!(e instanceof ShellError)) throw e;
        this.term.print(`bash: ${e.message}`, 'err');
        return;
      }

      let lastOut = '';
      let piped = false;
      for (const { op, pipeline } of lists) {
        if (op === '&&' && this.lastCode !== 0) continue;
        if (op === '||' && this.lastCode === 0) continue;
        if (pipeline.length > 1) piped = true;
        lastOut = await this.runPipeline(pipeline);
      }
      OS.bus.emit('shell:line', { line: trimmed, output: lastOut, piped, cwd: this.cwd, code: this.lastCode });
    }

    async runPipeline(pipeline) {
      let stdin = '';
      let text = '';
      for (let idx = 0; idx < pipeline.length; idx++) {
        const { words, redirs } = pipeline[idx];
        const isLast = idx === pipeline.length - 1;
        const outRedir = redirs.find((r) => r.op === '>' || r.op === '>>');
        const inRedir = redirs.find((r) => r.op === '<');

        let argv = [];
        for (const w of words) argv.push(...(w.glob ? OS.fs.glob(w.v, this.cwd) : [w.v]));

        let sudo = false;
        if (argv[0] === 'sudo') {
          argv.shift();
          sudo = true;
          if (!argv.length) {
            this.term.print('usage: sudo command', 'err');
            this.lastCode = 1;
            return '';
          }
          if (!OS.achievements.has('sudo_lecture')) {
            this.term.print('We trust you have received the usual lecture from the local System\nAdministrator. It usually boils down to these three things:\n\n    #1) Respect the privacy of others.\n    #2) Think before you type.\n    #3) With great power comes great responsibility.\n', 'info');
            OS.achievements.unlock('sudo_lecture');
          }
          OS.learn('sudo');
        }

        if (inRedir) {
          try { stdin = OS.fs.read(OS.fs.resolve(inRedir.file, this.cwd), sudo); } catch (e) {
            if (!(e instanceof FsError)) throw e;
            this.term.print(`bash: ${inRedir.file}: ${e.message}`, 'err');
            this.lastCode = 1;
            return '';
          }
        }

        const result = await this.runCommand(argv, { stdin, sudo, tty: isLast && !outRedir, piped: pipeline.length > 1 });
        text = result.text;

        if (outRedir) {
          try {
            OS.fs.write(OS.fs.resolve(outRedir.file, this.cwd), text, { append: outRedir.op === '>>', sudo });
          } catch (e) {
            if (!(e instanceof FsError)) throw e;
            this.term.print(`bash: ${outRedir.file}: ${e.message}`, 'err');
            this.lastCode = 1;
          }
          text = '';
        } else if (isLast && (text || result.html)) {
          this.term.print(result.html ? { html: result.html } : text, 'out');
        }
        stdin = text;
      }
      return text;
    }

    async runCommand(argv, { stdin, sudo, tty, piped }) {
      const name = argv[0];
      if (!name) return { text: stdin, html: null, code: 0 };
      const args = argv.slice(1);
      let code = 0;
      const ctx = {
        name, args, stdin, sudo, tty, piped, shell: this, term: this.term,
        resolve: (p) => OS.fs.resolve(p, this.cwd),
        err: (msg) => { this.term.print(msg, 'err'); code = 1; },
        print: (msg, cls = 'out') => this.term.print(msg, cls),
        fail: (e, path) => {
          if (e instanceof FsError) ctx.err(`${name}: ${path ? path + ': ' : ''}${e.message}`);
          else if (e instanceof UsageError) ctx.err(`${name}: ${e.message}`);
          else throw e;
        },
      };

      let text = '';
      let html = null;
      if (name.includes('/')) {
        text = await this.runScript(ctx, name, args);
      } else if (!OS.commands[name] || (OS.commands[name].needs && !OS.state.installed[OS.commands[name].needs])) {
        this.notFound(name);
        code = 127;
      } else {
        try {
          const out = await OS.commands[name].run(ctx);
          if (out && typeof out === 'object') { text = out.text ?? ''; html = tty ? out.html : null; }
          else text = out ?? '';
        } catch (e) {
          ctx.fail(e);
        }
        if (code === 0 && !OS.commands[name].hidden) OS.learn(name);
      }
      this.lastCode = code;
      OS.bus.emit('shell:cmd', { name, args, sudo, cwd: this.cwd, code, out: text });
      return { text, html, code };
    }

    notFound(name) {
      if (WINDOWS[name.toLowerCase()]) {
        this.term.print(`${name}: command not found\n'${name}' is a Windows command. On Linux, try: ${WINDOWS[name.toLowerCase()]}`, 'err');
        OS.achievements.unlock('windows_habit');
        return;
      }
      if (INSTALLABLE.includes(name)) {
        this.term.print(`Command '${name}' not found, but can be installed with:\n\n  sudo apt install ${name}\n`, 'err');
        return;
      }
      const names = Object.keys(OS.commands).filter((n) => !OS.commands[n].hidden);
      const close = names.filter((n) => levenshtein(n, name) <= (name.length >= 4 ? 2 : 1)).slice(0, 3);
      this.term.print(`${name}: command not found${close.length ? `\nDid you mean: ${close.join(', ')}?` : ''}`, 'err');
      OS.bus.emit('shell:notfound', { name, suggestions: close });
    }

    async runScript(ctx, path, args) {
      const abs = ctx.resolve(path);
      const node = OS.fs.lookup(abs);
      if (!node) { ctx.err(`bash: ${path}: No such file or directory`); return ''; }
      if (node.t === 'd') { ctx.err(`bash: ${path}: Is a directory`); return ''; }
      if (!OS.fs.canExec(node, ctx.sudo) && !ctx.forceRun) {
        ctx.err(`bash: ${path}: Permission denied`);
        OS.bus.emit('shell:noexec', { path: abs });
        return '';
      }
      OS.learn('./script');
      if (node.run && OS.scriptActions[node.run]) return OS.scriptActions[node.run](ctx, args, abs) ?? '';
      // User-written scripts: run each non-comment line.
      for (const line of toLines(node.c)) {
        if (line.trim() && !line.trim().startsWith('#')) await this.exec(line);
      }
      return '';
    }

    // Tab completion: returns { line, options }
    complete(line) {
      const m = line.match(/(\S*)$/);
      const partial = m[1];
      const before = line.slice(0, line.length - partial.length);
      const isCommand = !before.trim() || /(\||&&|;|sudo)\s*$/.test(before);
      let candidates;
      if (isCommand && !partial.includes('/')) {
        candidates = Object.keys(OS.commands)
          .filter((n) => !OS.commands[n].hidden && (!OS.commands[n].needs || OS.state.installed[OS.commands[n].needs]))
          .filter((n) => n.startsWith(partial))
          .map((n) => n + ' ');
      } else {
        const slash = partial.lastIndexOf('/');
        const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : '';
        const namePart = partial.slice(slash + 1);
        const dir = OS.fs.lookup(OS.fs.resolve(dirPart || '.', this.cwd));
        if (!dir || dir.t !== 'd') return { line, options: [] };
        candidates = Object.keys(dir.ch)
          .filter((n) => n.startsWith(namePart) && (namePart.startsWith('.') || !n.startsWith('.')))
          .map((n) => dirPart + n + (dir.ch[n].t === 'd' ? '/' : ' '));
      }
      if (candidates.length === 1) return { line: before + candidates[0], options: [] };
      if (!candidates.length) return { line, options: [] };
      // Extend to the longest common prefix.
      let prefix = candidates[0];
      for (const c of candidates) while (!c.startsWith(prefix)) prefix = prefix.slice(0, -1);
      return { line: before + (prefix.length > partial.length ? prefix : partial), options: candidates.map((c) => c.trim()) };
    }
  }

  OS.Shell = Shell;
  OS.shellInternals = { tokenize, parse };

  // ---------- Script actions (special files in the dungeon) ----------
  OS.scriptActions = {
    gate(ctx, args) {
      const dungeon = `${OS.fs.home()}/dungeon`;
      if (!args[0]) return 'The gate is carved with runes:\n  "Speak the secret word, traveller."\n\nUsage: ./gate.sh <secret-word>';
      if (args[0].toLowerCase() !== 'freedom') {
        ctx.err(`The gate does not budge. "${args[0]}" is not the word.`);
        return '';
      }
      if (!OS.fs.lookup(`${dungeon}/crypt`)) {
        const crypt = { t: 'd', o: 'user', m: '755', ch: {
          goblins: { t: 'd', o: 'user', m: '755', ch: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`goblin-${n}`, { t: 'f', o: 'user', m: '644', c: `Goblin #${n}. It is grumpy. It says: "grr".` }])) },
          'note.txt': { t: 'f', o: 'user', m: '644', c: 'Goblins have taken over the stairs.\n\nRemove them all with rm. You can delete many files at once with a wildcard:\n  rm goblins/*\n\nThen take the stairs:  ./stairs.sh' },
          'stairs.sh': { t: 'f', o: 'user', m: '755', c: '#!/bin/bash\n# Leads down.', run: 'stairs' },
        } };
        OS.fs.must(dungeon).ch.crypt = crypt;
        OS.fs.persist();
      }
      OS.bus.emit('action', { id: 'gate' });
      return '  ___________\n |  _______  |\n | |       | |    The word echoes: "freedom".\n | |   ✦   | |    The gate swings open!\n | |_______| |\n |___________|\n\nA new directory appeared: crypt/\nTry: cd crypt && ls';
    },
    stairs(ctx) {
      const goblins = OS.fs.lookup(`${OS.fs.home()}/dungeon/crypt/goblins`);
      const left = goblins && goblins.t === 'd' ? Object.keys(goblins.ch).length : 0;
      if (left) {
        ctx.err(`${left} goblin${left > 1 ? 's' : ''} block${left > 1 ? '' : 's'} the stairs! Remove them with rm first.`);
        return '';
      }
      OS.bus.emit('action', { id: 'stairs' });
      return 'You walk down the long stairs...\n\nAt the bottom, carved in stone:\n  "The crown rests in /root, home of the superuser.\n   Ordinary users may not look inside.\n   Ask for power with sudo:  sudo cat /root/crown.txt"';
    },
  };

  // ---------- Helpers for commands ----------
  function readInputs(ctx, files) {
    if (!files.length) return ctx.stdin;
    const parts = [];
    for (const f of files) {
      try { parts.push(OS.fs.read(ctx.resolve(f), ctx.sudo)); } catch (e) { ctx.fail(e, f); }
    }
    return parts.join('\n');
  }

  function textFilter(fnName, valued = []) {
    return (ctx) => {
      const { rest } = parseFlags(ctx.args, valued);
      const files = fnName === 'tr' ? [] : rest;
      const flagArgs = ctx.args.filter((a) => !files.includes(a) || a.startsWith('-'));
      let out = OS.text[fnName](fnName === 'tr' ? ctx.args : flagArgs, readInputs(ctx, files));
      if (fnName === 'wc' && files.length === 1) out += ` ${files[0]}`;
      return out;
    };
  }

  function walk(abs, sudo, visit) {
    const node = OS.fs.lookup(abs);
    if (!node) return;
    visit(abs, node);
    if (node.t === 'd' && OS.fs.canRead(node, sudo)) {
      for (const name of Object.keys(node.ch).sort()) walk(`${abs === '/' ? '' : abs}/${name}`, sudo, visit);
    }
  }

  function lsName(name, node) {
    const cls = node.t === 'd' ? 'c-blue' : OS.fs.bits(node) & 1 || node.m[0] & 1 ? 'c-green' : '';
    return { text: name, html: cls ? `<span class="${cls}">${esc(name)}</span>` : esc(name) };
  }

  const FORTUNES = [
    'Talk is cheap. Show me the code. - Linus Torvalds',
    'Software is like sex: it\'s better when it\'s free. - Linus Torvalds',
    'Unix is simple. It just takes a genius to understand its simplicity. - Dennis Ritchie',
    'Given enough eyeballs, all bugs are shallow. - Eric S. Raymond',
    'There is no place like 127.0.0.1',
    'Free software is a matter of liberty, not price. Think "free speech", not "free beer". - Richard Stallman',
    'Most good programmers do programming not because they expect to get paid, but because it is fun. - Linus Torvalds',
    'The best way to predict the future is to implement it.',
    'In a world without fences and walls, who needs Gates and Windows?',
    'It works on my machine.',
    'Read the f***ing manual. (RTFM) - every sysadmin, ever',
  ];

  const PROCS = () => [
    [1, 'root', '/sbin/init'],
    [2, 'root', '[kthreadd]'],
    [312, 'root', '/usr/sbin/NetworkManager'],
    [420, 'root', '/usr/sbin/sshd'],
    [512, 'root', '/usr/sbin/cron'],
    ...(OS.state.daemonKilled ? [] : [[666, 'root', '/usr/bin/segfault-daemon --steal-crowns']]),
    [801, OS.fs.user, '/usr/bin/tuxos-session'],
    [900, OS.fs.user, '/usr/bin/tuxterm'],
    [901, OS.fs.user, '-bash'],
  ];

  const PACKAGES = {
    cowsay: 'configurable talking cow',
    cmatrix: 'simulates the display from "The Matrix"',
    lolcat: 'rainbow coloring for text output',
    neofetch: 'shows system information with a logo',
    htop: 'interactive process viewer',
    firefox: 'web browser',
    gimp: 'GNU Image Manipulation Program',
    vlc: 'multimedia player',
    git: 'distributed version control system',
    python3: 'interactive high-level object-oriented language',
    steam: 'video game platform',
  };

  async function pkgInstall(ctx, manager, pkgs) {
    const say = (s) => ctx.print(s, 'out');
    if (!ctx.sudo) {
      const msg = {
        apt: 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?',
        dnf: 'Error: This command has to be run with superuser privileges (under the root user on most systems).',
        pacman: 'error: you cannot perform this operation unless you are root.',
      }[manager];
      ctx.err(msg);
      OS.bus.emit('pkg:denied', { manager });
      return;
    }
    if (!pkgs.length) { ctx.err(`${manager}: no packages given`); return; }
    for (const pkg of pkgs) {
      if (!PACKAGES[pkg]) {
        ctx.err(manager === 'pacman' ? `error: target not found: ${pkg}` : manager === 'dnf' ? `No match for argument: ${pkg}` : `E: Unable to locate package ${pkg}`);
        return;
      }
    }
    const fast = OS.util.reducedMotion() ? 0 : 1;
    if (manager === 'apt') {
      say('Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done');
      say(`The following NEW packages will be installed:\n  ${pkgs.join(' ')}`);
    } else if (manager === 'pacman') {
      say(`resolving dependencies...\nlooking for conflicting packages...\n\nPackages (${pkgs.length}) ${pkgs.map((p) => p + '-1.0-1').join('  ')}\n\n:: Proceed with installation? [Y/n] y`);
    } else {
      say(`Dependencies resolved.\n Package        Arch      Version     Repository\n${pkgs.map((p) => ` ${p.padEnd(15)}x86_64    1.0-1       fedora`).join('\n')}\nIs this ok [y/N]: y`);
    }
    for (const pkg of pkgs) {
      for (let p = 0; p <= 100; p += 25) {
        await OS.util.sleep(120 * fast);
        say(`${manager === 'pacman' ? '(1/1) installing' : 'Unpacking'} ${pkg} [${'#'.repeat(p / 5).padEnd(20, '.')}] ${p}%`);
      }
      OS.state.installed[pkg] = true;
      const bin = OS.fs.lookup('/usr/bin');
      if (bin) bin.ch[pkg] = { t: 'f', o: 'root', m: '755', c: `(${pkg} binary)` };
      OS.bus.emit('pkg:install', { pkg, manager });
    }
    OS.fs.persist();
    say(manager === 'apt' ? `Setting up ${pkgs.join(', ')} ... done.` : 'Complete!');
    if (pkgs.some((p) => OS.commands[p])) say(`\nTry it: ${pkgs.find((p) => OS.commands[p])}${pkgs.includes('cowsay') ? ' Hello!' : ''}`, 'info');
  }

  function pkgRemove(ctx, manager, pkgs) {
    if (!ctx.sudo) { ctx.err(`${manager}: permission denied (are you root?)`); return; }
    for (const pkg of pkgs) {
      if (!OS.state.installed[pkg]) { ctx.err(`${pkg} is not installed`); continue; }
      delete OS.state.installed[pkg];
      const bin = OS.fs.lookup('/usr/bin');
      if (bin) delete bin.ch[pkg];
      ctx.print(`Removing ${pkg} ... done`);
    }
    OS.fs.persist();
  }

  async function pkgUpdate(ctx, manager) {
    if (!ctx.sudo) { ctx.err(`${manager}: permission denied (are you root?)`); return; }
    const lines = {
      apt: ['Hit:1 http://deb.tuxos.org stable InRelease', 'Get:2 http://security.tuxos.org stable-security InRelease [48.0 kB]', 'Fetched 48.0 kB in 1s (48.0 kB/s)', 'Reading package lists... Done', 'All packages are up to date.'],
      pacman: [':: Synchronizing package databases...', ' core is up to date', ' extra is up to date', ':: Starting full system upgrade...', ' there is nothing to do'],
      dnf: ['Last metadata expiration check: 0:00:01 ago.', 'Dependencies resolved.', 'Nothing to do.', 'Complete!'],
    }[manager];
    for (const l of lines) { ctx.print(l); await OS.util.sleep(OS.util.reducedMotion() ? 0 : 150); }
  }

  function cow(text, figure = 'cow') {
    const lines = text.match(/.{1,38}(\s|$)|\S+/g)?.map((l) => l.trim()) || [''];
    const w = Math.max(...lines.map((l) => l.length));
    const top = ' ' + '_'.repeat(w + 2);
    const bot = ' ' + '-'.repeat(w + 2);
    const body = lines.length === 1
      ? [`< ${lines[0]} >`]
      : lines.map((l, i) => {
        const [a, b] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
        return `${a} ${l.padEnd(w)} ${b}`;
      });
    const art = figure === 'tux'
      ? '   \\\n    \\\n        .--.\n       |o_o |\n       |:_/ |\n      //   \\ \\\n     (|     | )\n    /\'\\_   _/`\\\n    \\___)=(___/'
      : '        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||';
    return [top, ...body, bot, art].join('\n');
  }

  // ---------- Commands ----------
  const C = (cat, desc, usage, example, run, extra = {}) => ({ cat, desc, usage, example, run, ...extra });

  OS.commands = {
    help: C('basics', 'List the commands you can use', 'help [command]', 'help', (ctx) => {
      if (ctx.args[0]) return OS.commands.man.run({ ...ctx, args: ctx.args });
      const cats = { basics: 'Basics', files: 'Files & folders', text: 'Reading & searching text', system: 'System', fun: 'Fun' };
      let html = '<span class="c-yellow">TuxOS bash. These are the commands you can use.</span>\nType <span class="c-green">man &lt;command&gt;</span> to learn more about one.\n';
      let text = '';
      for (const [cat, title] of Object.entries(cats)) {
        const names = Object.keys(OS.commands).filter((n) => OS.commands[n].cat === cat && !OS.commands[n].hidden && (!OS.commands[n].needs || OS.state.installed[OS.commands[n].needs]));
        html += `\n<span class="c-blue">${title}</span>\n`;
        for (const n of names) {
          html += `  <span class="c-green">${n.padEnd(10)}</span> ${esc(OS.commands[n].desc)}\n`;
          text += `${n}\t${OS.commands[n].desc}\n`;
        }
      }
      html += '\n<span class="c-dim">Tips: Tab completes names, ↑ repeats commands, Ctrl+L clears, Ctrl+C cancels.</span>';
      return { text, html };
    }),

    man: C('basics', 'Show the manual page for a command', 'man <command>', 'man ls', (ctx) => {
      const name = ctx.args[0];
      if (!name) { ctx.err('What manual page do you want?\nFor example, try: man ls'); return ''; }
      const c = OS.commands[name];
      if (!c || c.hidden) { ctx.err(`No manual entry for ${name}`); return ''; }
      const html = `<span class="c-bold">${esc(name.toUpperCase())}(1)</span>\n\n<span class="c-bold">NAME</span>\n    ${esc(name)} - ${esc(c.desc)}\n\n<span class="c-bold">SYNOPSIS</span>\n    ${esc(c.usage)}\n${c.more ? `\n<span class="c-bold">DESCRIPTION</span>\n    ${esc(c.more).replace(/\n/g, '\n    ')}\n` : ''}\n<span class="c-bold">EXAMPLE</span>\n    <span class="c-green">$ ${esc(c.example)}</span>`;
      return { text: `${name} - ${c.desc}\nUsage: ${c.usage}\nExample: ${c.example}`, html };
    }),

    whatis: C('basics', 'Show a one-line description of a command', 'whatis <command>', 'whatis grep', (ctx) =>
      ctx.args.map((n) => (OS.commands[n] ? `${n} (1) - ${OS.commands[n].desc}` : `${n}: nothing appropriate.`)).join('\n')),

    clear: C('basics', 'Clear the terminal screen', 'clear', 'clear', (ctx) => { ctx.term.clear(); return ''; }),

    echo: C('basics', 'Print text (or write it into a file with >)', 'echo [text...]', 'echo "hello" > hello.txt', (ctx) =>
      ctx.args[0] === '-n' ? ctx.args.slice(1).join(' ') : ctx.args.join(' ')),

    whoami: C('basics', 'Print your username', 'whoami', 'whoami', (ctx) => (ctx.sudo ? 'root' : OS.fs.user)),

    history: C('basics', 'Show the commands you have typed', 'history', 'history', () =>
      OS.state.history.map((l, i) => `${String(i + 1).padStart(5)}  ${l}`).join('\n')),

    exit: C('basics', 'Close the terminal', 'exit', 'exit', (ctx) => { ctx.term.close(); return ''; }),

    pwd: C('files', 'Print the directory you are in', 'pwd', 'pwd', (ctx) => ctx.shell.cwd),

    ls: C('files', 'List files in a directory', 'ls [-a] [-l] [path...]', 'ls -la', (ctx) => {
      const { flags, rest } = parseFlags(ctx.args);
      const targets = rest.length ? rest : ['.'];
      const texts = [];
      const htmls = [];
      const fileTexts = [];
      const fileHtmls = [];
      const user = OS.fs.user;
      const fmt = (name, node) => {
        const n = lsName(name, node);
        if (!flags.l) return n;
        const owner = node.o === 'user' ? user : 'root';
        const size = node.t === 'd' ? 4096 : node.c.length;
        const pre = `${OS.fs.modeString(node)} 1 ${owner.padEnd(8)} ${owner.padEnd(8)} ${String(size).padStart(5)} Oct  8 09:00 `;
        return { text: pre + n.text, html: esc(pre) + n.html };
      };
      for (const target of targets) {
        const abs = ctx.resolve(target);
        let node;
        try {
          node = OS.fs.must(abs);
          if (node.t === 'f') {
            const f = fmt(target, node);
            fileTexts.push(f.text); fileHtmls.push(f.html);
            continue;
          }
          let names = OS.fs.list(abs, ctx.sudo);
          if (!flags.a) names = names.filter((n) => !n.startsWith('.'));
          const items = names.map((n) => fmt(n, node.ch[n]));
          if (flags.a) items.unshift(fmt('.', node), fmt('..', OS.fs.lookup(OS.fs.split(abs)[0]) || node));
          const header = targets.length > 1 ? `${target}:\n` : '';
          const sep = flags.l || ctx.piped || !ctx.tty ? '\n' : '  ';
          texts.push(header + items.map((i) => i.text).join(flags.l || !ctx.tty ? '\n' : '  '));
          htmls.push(esc(header) + items.map((i) => i.html).join(sep));
        } catch (e) { ctx.fail(e, `cannot access '${target}'`); }
      }
      if (flags.a) OS.bus.emit('shell:ls-a', { cwd: ctx.shell.cwd, targets });
      // Plain files are listed together first, then each directory as its own block.
      const fileSep = flags.l || !ctx.tty ? '\n' : '  ';
      if (fileTexts.length) { texts.unshift(fileTexts.join(fileSep)); htmls.unshift(fileHtmls.join(fileSep)); }
      return { text: texts.join('\n\n'), html: htmls.join('\n\n') };
    }, { more: '-a  show hidden files (names starting with a dot)\n-l  long format: permissions, owner, size\nDirectories are blue, runnable files are green.' }),

    cd: C('files', 'Change directory', 'cd [directory]', 'cd dungeon', (ctx) => {
      if (ctx.sudo) { ctx.err('sudo: cd: command not found\n(cd is built into the shell, so sudo cannot run it. Try: sudo ls /root)'); return ''; }
      let target = ctx.args[0] ?? '~';
      if (target === '-') target = ctx.shell.prevCwd;
      const abs = ctx.resolve(target);
      const node = OS.fs.lookup(abs);
      if (!node) { ctx.err(`bash: cd: ${target}: No such file or directory`); return ''; }
      if (node.t !== 'd') { ctx.err(`bash: cd: ${target}: Not a directory`); return ''; }
      if (!OS.fs.canExec(node, false)) { ctx.err(`bash: cd: ${target}: Permission denied`); return ''; }
      ctx.shell.prevCwd = ctx.shell.cwd;
      ctx.shell.cwd = abs;
      OS.bus.emit('shell:cwd', { cwd: abs });
      return '';
    }, { more: 'cd with no arguments takes you home (~).\ncd .. goes up one level.\ncd - goes back to the previous directory.' }),

    cat: C('files', 'Print the contents of a file', 'cat [-n] <file...>', 'cat welcome.txt', (ctx) => {
      const { flags, rest } = parseFlags(ctx.args);
      if (!rest.length && !ctx.piped) { ctx.err('cat: missing file name. Example: cat welcome.txt'); return ''; }
      const out = readInputs(ctx, rest);
      return flags.n ? toLines(out).map((l, i) => `${String(i + 1).padStart(6)}  ${l}`).join('\n') : out;
    }),

    less: C('files', 'Read a long file (here: same as cat)', 'less <file>', 'less /var/log/syslog', (ctx) => OS.commands.cat.run(ctx), { hidden: true }),

    tree: C('files', 'Show a directory and everything inside it as a tree', 'tree [path]', 'tree dungeon', (ctx) => {
      const start = ctx.args[0] || '.';
      const abs = ctx.resolve(start);
      const root = OS.fs.lookup(abs);
      if (!root || root.t !== 'd') { ctx.err(`${start} [error opening dir]`); return ''; }
      let dirs = 0; let files = 0;
      const lines = [start];
      const htmlLines = [`<span class="c-blue">${esc(start)}</span>`];
      (function rec(node, prefix) {
        if (!OS.fs.canRead(node, ctx.sudo)) return;
        const names = Object.keys(node.ch).filter((n) => !n.startsWith('.')).sort();
        names.forEach((name, i) => {
          const child = node.ch[name];
          const last = i === names.length - 1;
          const branch = prefix + (last ? '└── ' : '├── ');
          lines.push(branch + name);
          htmlLines.push(esc(branch) + lsName(name, child).html);
          if (child.t === 'd') { dirs++; rec(child, prefix + (last ? '    ' : '│   ')); } else files++;
        });
      })(root, '');
      const summary = `\n${dirs} directories, ${files} files`;
      return { text: lines.join('\n') + summary, html: htmlLines.join('\n') + summary };
    }),

    mkdir: C('files', 'Make a new directory', 'mkdir [-p] <name...>', 'mkdir trophies', (ctx) => {
      const { flags, rest } = parseFlags(ctx.args);
      if (!rest.length) ctx.err('mkdir: missing operand');
      for (const d of rest) {
        try { OS.fs.mkdir(ctx.resolve(d), { parents: flags.p, sudo: ctx.sudo }); } catch (e) { ctx.fail(e, `cannot create directory '${d}'`); }
      }
      return '';
    }),

    touch: C('files', 'Create an empty file', 'touch <file...>', 'touch notes.txt', (ctx) => {
      if (!ctx.args.length) ctx.err('touch: missing file operand');
      for (const f of ctx.args) {
        const abs = ctx.resolve(f);
        if (OS.fs.lookup(abs)) continue;
        try { OS.fs.write(abs, '', { sudo: ctx.sudo }); } catch (e) { ctx.fail(e, `cannot touch '${f}'`); }
      }
      return '';
    }),

    rm: C('files', 'Remove (delete) files', 'rm [-r] [-f] <path...>', 'rm goblins/*', async (ctx) => {
      const { rest } = parseFlags(ctx.args.filter((a) => a !== '--no-preserve-root'));
      const recursive = ctx.args.some((a) => /^-[a-zA-Z]*[rR]/.test(a));
      const force = ctx.args.some((a) => /^-[a-zA-Z]*f/.test(a));
      const noPreserve = ctx.args.includes('--no-preserve-root');
      const rootTargets = rest.map((p) => ctx.resolve(p));
      const nukesRoot = rootTargets.includes('/') || (rootTargets.length > 8 && rootTargets.every((p) => p.split('/').length === 2));
      if (nukesRoot && recursive) {
        OS.achievements.unlock('rm_rf');
        if (!ctx.sudo) {
          ctx.err('rm: cannot remove \'/bin\': Permission denied\nrm: cannot remove \'/etc\': Permission denied\n...\n(Only root could do that much damage. Good thing you are not root.)');
          return '';
        }
        if (rest.includes('/') && !noPreserve) {
          ctx.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe");
          OS.bus.emit('tux:say', 'Phew! Real GNU rm refuses to delete / unless you really insist. Please never insist.');
          return '';
        }
        await ctx.term.panic();
        return '';
      }
      if (!rest.length) ctx.err('rm: missing operand');
      for (const p of rest) {
        try { OS.fs.remove(ctx.resolve(p), { recursive, sudo: ctx.sudo }); } catch (e) {
          if (force && e.message === 'No such file or directory') continue;
          ctx.fail(e, `cannot remove '${p}'`);
        }
      }
      return '';
    }, { more: 'There is no recycle bin in the terminal: rm is forever.\n-r  remove directories and everything in them\n-f  do not complain about missing files' }),

    rmdir: C('files', 'Remove an empty directory', 'rmdir <dir>', 'rmdir old-folder', (ctx) => {
      for (const d of ctx.args) {
        try { OS.fs.remove(ctx.resolve(d), { dirOnly: true, sudo: ctx.sudo }); } catch (e) { ctx.fail(e, `failed to remove '${d}'`); }
      }
      return '';
    }),

    cp: C('files', 'Copy files', 'cp [-r] <source...> <destination>', 'cp crown.txt ~/trophies/', (ctx) => {
      const { flags, rest } = parseFlags(ctx.args);
      if (rest.length < 2) { ctx.err('cp: missing destination file operand'); return ''; }
      const dst = ctx.resolve(rest.pop());
      for (const s of rest) {
        try { OS.fs.copy(ctx.resolve(s), dst, { recursive: flags.r || flags.R, sudo: ctx.sudo }); } catch (e) { ctx.fail(e, `cannot copy '${s}'`); }
      }
      return '';
    }),

    mv: C('files', 'Move or rename files', 'mv <source...> <destination>', 'mv old.txt new.txt', (ctx) => {
      const { rest } = parseFlags(ctx.args);
      if (rest.length < 2) { ctx.err('mv: missing destination file operand'); return ''; }
      const dst = ctx.resolve(rest.pop());
      for (const s of rest) {
        try { OS.fs.move(ctx.resolve(s), dst, { sudo: ctx.sudo }); } catch (e) { ctx.fail(e, `cannot move '${s}'`); }
      }
      return '';
    }),

    chmod: C('files', 'Change file permissions', 'chmod <mode> <file...>', 'chmod +x gate.sh', (ctx) => {
      const [mode, ...files] = ctx.args;
      if (!mode || !files.length) { ctx.err('chmod: missing operand. Example: chmod +x script.sh'); return ''; }
      for (const f of files) {
        try {
          const abs = ctx.resolve(f);
          OS.fs.chmod(abs, mode, { sudo: ctx.sudo });
          OS.bus.emit('fs:chmod', { path: abs, mode });
        } catch (e) { ctx.fail(e, `changing permissions of '${f}'`); }
      }
      return '';
    }, { more: '+x  make a file executable (runnable)\n-w  remove write permission\n755 numeric form: rwx for you, r-x for everyone else' }),

    find: C('files', 'Search for files by name', 'find [path] [-name pattern] [-type f|d]', 'find . -name "*.txt"', (ctx) => {
      const args = ctx.args.slice();
      const start = args[0] && !args[0].startsWith('-') ? args.shift() : '.';
      let namePat = null; let type = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-name' || args[i] === '-iname') namePat = { p: args[++i], i: args[i - 1] === '-iname' };
        else if (args[i] === '-type') type = args[++i];
      }
      const re = namePat && new RegExp('^' + namePat.p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', namePat.i ? 'i' : '');
      const base = ctx.resolve(start);
      if (!OS.fs.lookup(base)) { ctx.err(`find: '${start}': No such file or directory`); return ''; }
      const out = [];
      walk(base, ctx.sudo, (abs, node) => {
        const name = abs.split('/').pop() || '/';
        if (re && !re.test(name)) return;
        if (type && node.t !== type) return;
        const rel = abs.slice(base === '/' ? 0 : base.length);
        out.push(base === '/' ? abs : rel ? start.replace(/\/$/, '') + rel : start);
      });
      return out.join('\n');
    }),

    grep: C('text', 'Search for text inside files', 'grep [-r] [-i] [-n] [-v] [-c] <pattern> [file...]', 'grep -r secret library', (ctx) => {
      const { flags, rest } = parseFlags(ctx.args);
      if (!rest.length) { ctx.err('usage: grep [-r] [-i] [-n] [-v] [-c] PATTERN [FILE...]'); return ''; }
      const [pattern, ...paths] = rest;
      const passFlags = ['i', 'v', 'n', 'c'].filter((f) => flags[f]).map((f) => `-${f}`);
      if (!paths.length) {
        if (flags.r) paths.push('.');
        else return OS.text.grep([...passFlags, pattern], ctx.stdin);
      }
      const files = [];
      for (const p of paths) {
        const abs = ctx.resolve(p);
        const node = OS.fs.lookup(abs);
        if (!node) { ctx.err(`grep: ${p}: No such file or directory`); continue; }
        if (node.t === 'd') {
          if (!flags.r) { ctx.err(`grep: ${p}: Is a directory`); continue; }
          walk(abs, ctx.sudo, (a, n) => { if (n.t === 'f') files.push([p.replace(/\/$/, '') + a.slice(abs.length), a, n]); });
        } else files.push([p, abs, node]);
      }
      const multi = files.length > 1 || flags.r;
      const out = [];
      const html = [];
      const hl = OS.text.makeMatcher(pattern, flags.i);
      let re = null;
      try { re = new RegExp(`(${pattern})`, flags.i ? 'gi' : 'g'); } catch { /* literal */ }
      for (const [shown, abs, node] of files) {
        if (!OS.fs.canRead(node, ctx.sudo)) { ctx.err(`grep: ${shown}: Permission denied`); continue; }
        const content = OS.fs.read(abs, ctx.sudo);
        const res = OS.text.grep([...passFlags, pattern], content);
        if (flags.l) { if (res && res !== '0') { out.push(shown); html.push(`<span class="c-purple">${esc(shown)}</span>`); } continue; }
        if (flags.c) { out.push(multi ? `${shown}:${res}` : res); html.push(esc(multi ? `${shown}:${res}` : res)); continue; }
        for (const line of toLines(res)) {
          out.push(multi ? `${shown}:${line}` : line);
          const body = re && !flags.v && hl(line) ? esc(line).replace(new RegExp(re.source, re.flags), '<span class="c-red c-bold">$1</span>') : esc(line);
          html.push(multi ? `<span class="c-purple">${esc(shown)}</span><span class="c-dim">:</span>${body}` : body);
        }
      }
      return { text: out.join('\n'), html: html.join('\n') };
    }, { more: '-r  search every file inside a directory\n-i  ignore upper/lower case\n-n  show line numbers\n-v  show lines that do NOT match\n-c  count matching lines' }),

    head: C('text', 'Show the first lines of a file', 'head [-n N] [file]', 'head -n 3 /var/log/syslog', textFilter('head', ['n'])),
    tail: C('text', 'Show the last lines of a file', 'tail [-n N] [file]', 'tail -n 5 /var/log/syslog', textFilter('tail', ['n'])),
    wc: C('text', 'Count lines, words and characters', 'wc [-l] [-w] [-c] [file]', 'wc -l /var/log/syslog', textFilter('wc')),
    sort: C('text', 'Sort lines alphabetically or numerically', 'sort [-r] [-n] [-u] [file]', 'sort -r names.txt', textFilter('sort', ['k'])),
    uniq: C('text', 'Remove repeated neighbouring lines', 'uniq [-c] [file]', 'sort votes.txt | uniq -c', textFilter('uniq')),
    tr: C('text', 'Translate characters', 'tr <set1> <set2>', 'echo hello | tr a-z A-Z', textFilter('tr')),
    cut: C('text', 'Cut out columns from each line', 'cut -d <delim> -f <fields> [file]', 'cut -d: -f1 /etc/passwd', textFilter('cut', ['d', 'f', 'c'])),
    rev: C('text', 'Reverse each line', 'rev [file]', 'echo stressed | rev', textFilter('rev')),

    nano: C('files', 'Edit a text file (friendly editor)', 'nano <file>', 'nano notes.txt', async (ctx) => {
      const f = ctx.args[0];
      if (!f) { ctx.err('nano: please give a file name. Example: nano notes.txt'); return ''; }
      const abs = ctx.resolve(f);
      const node = OS.fs.lookup(abs);
      if (node && node.t === 'd') { ctx.err(`nano: ${f}: Is a directory`); return ''; }
      if (node && !OS.fs.canRead(node, ctx.sudo)) { ctx.err(`nano: ${f}: Permission denied`); return ''; }
      await ctx.term.editor({ mode: 'nano', path: abs, label: f, content: node ? node.c : '', sudo: ctx.sudo });
      return '';
    }, { more: 'Type to edit. Ctrl+O saves ("write out"). Ctrl+X exits.' }),

    vim: C('fun', 'A powerful editor. Famously hard to quit.', 'vim [file]', 'vim notes.txt', async (ctx) => {
      const abs = ctx.args[0] ? ctx.resolve(ctx.args[0]) : null;
      const node = abs && OS.fs.lookup(abs);
      await ctx.term.editor({ mode: 'vim', path: abs, label: ctx.args[0] || '[No Name]', content: node && node.t === 'f' && OS.fs.canRead(node, ctx.sudo) ? node.c : '', sudo: ctx.sudo });
      return '';
    }),

    // System
    sudo: C('system', 'Run a command as the superuser (root)', 'sudo <command>', 'sudo cat /root/crown.txt', () => '', {
      more: 'sudo = "superuser do". root can read and change anything,\nso think before you sudo.',
    }),

    apt: C('system', 'Install software (Debian, Ubuntu, Mint)', 'sudo apt install <package>', 'sudo apt install cowsay', async (ctx) => {
      const [sub, ...pkgs] = ctx.args;
      if (sub === 'install') await pkgInstall(ctx, 'apt', pkgs);
      else if (sub === 'remove' || sub === 'purge') pkgRemove(ctx, 'apt', pkgs);
      else if (sub === 'update' || sub === 'upgrade') await pkgUpdate(ctx, 'apt');
      else if (sub === 'search') return Object.entries(PACKAGES).filter(([p, d]) => !pkgs[0] || p.includes(pkgs[0]) || d.includes(pkgs[0])).map(([p, d]) => `${p}/stable 1.0-1 amd64\n  ${d}`).join('\n\n');
      else if (sub === 'list') return Object.keys(OS.state.installed).map((p) => `${p}/stable,now 1.0-1 amd64 [installed]`).join('\n') || 'No packages installed yet.';
      else ctx.err('usage: apt [install|remove|update|upgrade|search|list] <package>');
      return '';
    }, { more: 'Packages you can try: ' + Object.keys(PACKAGES).join(', ') }),

    dnf: C('system', 'Install software (Fedora, Red Hat)', 'sudo dnf install <package>', 'sudo dnf install cowsay', async (ctx) => {
      const [sub, ...pkgs] = ctx.args;
      if (sub === 'install') await pkgInstall(ctx, 'dnf', pkgs);
      else if (sub === 'remove') pkgRemove(ctx, 'dnf', pkgs);
      else if (sub === 'update' || sub === 'upgrade') await pkgUpdate(ctx, 'dnf');
      else ctx.err('usage: dnf [install|remove|upgrade] <package>');
      return '';
    }),

    pacman: C('system', 'Install software (Arch, Manjaro)', 'sudo pacman -S <package>', 'sudo pacman -S cowsay', async (ctx) => {
      const [sub, ...pkgs] = ctx.args;
      if (/^-S[a-z]*$/.test(sub) && pkgs.length) await pkgInstall(ctx, 'pacman', pkgs);
      else if (/^-Sy+u$/.test(sub)) await pkgUpdate(ctx, 'pacman');
      else if (/^-R/.test(sub)) pkgRemove(ctx, 'pacman', pkgs);
      else ctx.err('usage: pacman -S <package>  |  pacman -Syu  |  pacman -R <package>');
      return '';
    }),

    ps: C('system', 'List running processes', 'ps [aux]', 'ps aux', () => {
      const rows = PROCS().map(([pid, user, cmd]) => `${user.padEnd(10)} ${String(pid).padStart(5)}  ${cmd}`);
      return [`${'USER'.padEnd(10)} ${'PID'.padStart(5)}  COMMAND`, ...rows].join('\n');
    }),

    top: C('system', 'Show running processes', 'top', 'top', (ctx) => OS.commands.ps.run(ctx), { hidden: true }),

    kill: C('system', 'Stop a process by its PID', 'kill [-9] <pid>', 'kill 901', async (ctx) => {
      const pids = ctx.args.filter((a) => !a.startsWith('-')).map(Number);
      if (!pids.length) { ctx.err('kill: usage: kill [-9] <pid>   (find PIDs with ps)'); return ''; }
      for (const pid of pids) {
        const proc = PROCS().find((p) => p[0] === pid);
        if (!proc) { ctx.err(`kill: (${pid}) - No such process`); continue; }
        if (proc[1] === 'root' && !ctx.sudo) { ctx.err(`kill: (${pid}) - Operation not permitted`); continue; }
        if (pid === 1) { await ctx.term.panic('Attempted to kill init!'); return ''; }
        if (pid === 666) {
          OS.state.daemonKilled = true;
          OS.save();
          OS.achievements.unlock('daemon');
          ctx.print('The segfault daemon lets out a final "core dumped" and vanishes.', 'info');
        } else if (pid === 901 || pid === 900) {
          ctx.term.close();
        } else {
          ctx.print(`(${pid}) is a system service. It restarts itself. systemd is persistent like that.`, 'info');
        }
      }
      return '';
    }),

    killall: C('system', 'Stop processes by name', 'killall <name>', 'killall segfault-daemon', (ctx) => {
      const proc = PROCS().find((p) => p[2].includes(ctx.args[0] || '\0'));
      if (!proc) { ctx.err(`${ctx.args[0] || ''}: no process found`); return ''; }
      return OS.commands.kill.run({ ...ctx, args: [String(proc[0])] });
    }),

    uname: C('system', 'Show kernel information', 'uname [-a]', 'uname -a', (ctx) =>
      ctx.args.includes('-a') ? 'Linux tuxos 6.10.0-tuxos #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux' : ctx.args.includes('-r') ? '6.10.0-tuxos' : 'Linux'),

    hostname: C('system', 'Show the computer\'s name', 'hostname', 'hostname', () => 'tuxos'),

    date: C('system', 'Show the date and time', 'date', 'date', () => new Date().toString().replace(/ GMT.*$/, '')),

    uptime: C('system', 'Show how long the system has been running', 'uptime', 'uptime', () => {
      const mins = Math.floor(performance.now() / 60000);
      return ` ${new Date().toTimeString().slice(0, 8)} up ${mins} min,  1 user,  load average: 0.42, 0.13, 0.37`;
    }),

    df: C('system', 'Show disk space', 'df [-h]', 'df -h', () =>
      'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda2       100G   23G   77G  23% /\ntmpfs           7.8G  1.2M  7.8G   1% /tmp'),

    free: C('system', 'Show memory usage', 'free [-h]', 'free -h', () =>
      '               total        used        free      shared  buff/cache   available\nMem:            15Gi       3.1Gi       9.2Gi       412Mi       3.6Gi        12Gi\nSwap:          4.0Gi          0B       4.0Gi'),

    which: C('system', 'Show where a command lives', 'which <command>', 'which ls', (ctx) =>
      ctx.args.map((n) => (OS.commands[n] && (!OS.commands[n].needs || OS.state.installed[n]) ? `/usr/bin/${n}` : '')).filter(Boolean).join('\n')),

    env: C('system', 'Show environment variables', 'env', 'echo $HOME', (ctx) =>
      Object.entries(ctx.shell.env).filter(([k]) => k !== '?').map(([k, v]) => `${k}=${v}`).join('\n')),

    ping: C('system', 'Check if another computer is reachable', 'ping <host>', 'ping kernel.org', async (ctx) => {
      const host = ctx.args.find((a) => !a.startsWith('-'));
      if (!host) { ctx.err('ping: usage error: Destination address required'); return ''; }
      ctx.print(`PING ${host} (93.184.216.34) 56(84) bytes of data.`);
      for (let i = 1; i <= 4; i++) {
        await OS.util.sleep(OS.util.reducedMotion() ? 0 : 400);
        if (ctx.term.cancelled) break;
        ctx.print(`64 bytes from ${host}: icmp_seq=${i} ttl=56 time=${(12 + Math.random() * 6).toFixed(1)} ms`);
      }
      return `\n--- ${host} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss`;
    }),

    neofetch: C('system', 'Show system info with a logo', 'neofetch', 'neofetch', (ctx) => {
      const art = ['        .--.       ', '       |o_o |      ', '       |:_/ |      ', '      //   \\ \\     ', '     (|     | )    ', "    /'\\_   _/`\\    ", '    \\___)=(___/    ', '', ''];
      const theme = OS.themes.find((t) => t.id === OS.state.theme)?.version;
      const done = Object.keys(OS.state.quests.done).length;
      const info = [
        [`${OS.fs.user}@tuxos`, ''],
        ['-'.repeat(OS.fs.user.length + 6), ''],
        ['OS', 'TuxOS 1.0 (Curious Penguin) x86_64'],
        ['Kernel', '6.10.0-tuxos'],
        ['Uptime', `${Math.floor(performance.now() / 60000)} mins`],
        ['Packages', `${142 + Object.keys(OS.state.installed).length} (apt)`],
        ['Shell', 'bash 5.2'],
        ['DE', theme],
        ['Commands learned', String(Object.keys(OS.state.learned).length)],
        ['Quests', `${done}/${OS.quests.list.length}`],
      ];
      const text = info.map(([k, v], i) => `${art[i] ?? ''.padEnd(19)}${v ? `${k}: ${v}` : k}`).join('\n');
      const colors = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#e5e7eb'].map((c) => `<span style="color:${c}">███</span>`).join('');
      const html = info.map(([k, v], i) => `<span class="c-yellow">${esc((art[i] ?? '').padEnd(19))}</span>${v ? `<span class="c-blue c-bold">${esc(k)}</span>: ${esc(v)}` : `<span class="c-green c-bold">${esc(k)}</span>`}`).join('\n') + `\n${''.padEnd(19)}${colors}`;
      return { text, html };
    }),

    'xdg-open': C('system', 'Open a file or folder in its app', 'xdg-open <path|app>', 'xdg-open .', (ctx) => {
      const target = ctx.args[0] || '.';
      if (OS.apps[target]) { OS.wm.open(target); return ''; }
      const abs = ctx.resolve(target);
      const node = OS.fs.lookup(abs);
      if (!node) { ctx.err(`xdg-open: ${target}: no such file, folder or app\nApps: ${Object.keys(OS.apps).join(', ')}`); return ''; }
      OS.wm.open('files', { path: node.t === 'd' ? abs : OS.fs.split(abs)[0], select: node.t === 'f' ? abs : null });
      return '';
    }),

    reboot: C('system', 'Restart the computer', 'reboot', 'reboot', async (ctx) => {
      ctx.print('Broadcast message from root@tuxos: The system will reboot now!', 'info');
      await OS.util.sleep(800);
      location.reload();
      return '';
    }),

    shutdown: C('system', 'Turn off the computer', 'shutdown now', 'shutdown now', async () => {
      await OS.boot.shutdown();
      return '';
    }),

    // Game helpers
    quest: C('basics', 'Show your current quest', 'quest', 'quest', () => OS.quests.describe()),
    hint: C('basics', 'Get a hint for your current quest', 'hint', 'hint', () => OS.quests.hint()),

    // Fun
    fortune: C('fun', 'Print a random quote', 'fortune', 'fortune', () => {
      OS.achievements.unlock('fortune');
      return FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    }),

    cowsay: C('fun', 'A cow says your message', 'cowsay [-f tux] <message>', 'cowsay Hello!', (ctx) => {
      const { flags, rest } = parseFlags(ctx.args, ['f']);
      const text = rest.join(' ') || ctx.stdin.trim() || 'Moo.';
      OS.achievements.unlock('cowsay');
      OS.bus.emit('cowsay');
      return cow(text, flags.f === 'tux' ? 'tux' : 'cow');
    }, { needs: 'cowsay', more: 'Try: cowsay -f tux Hello\nOr pipe into it: fortune | cowsay' }),

    lolcat: C('fun', 'Rainbow-colour any text', 'lolcat', 'fortune | lolcat', (ctx) => {
      const input = ctx.args.length ? readInputs(ctx, ctx.args) : ctx.stdin;
      let i = 0;
      const html = toLines(input).map((line, row) => [...line].map((ch) => `<span style="color:hsl(${(i++ * 8 + row * 20) % 360} 90% 65%)">${esc(ch)}</span>`).join('')).join('\n');
      return { text: input, html };
    }, { needs: 'lolcat' }),

    cmatrix: C('fun', 'Digital rain', 'cmatrix', 'cmatrix', async (ctx) => {
      OS.achievements.unlock('matrix');
      await ctx.term.matrix();
      return '';
    }, { needs: 'cmatrix' }),

    sl: C('fun', 'Steam locomotive (for when you mistype ls)', 'sl', 'sl', async (ctx) => {
      OS.achievements.unlock('sl');
      await ctx.term.train();
      return '';
    }, { hidden: true }),

    make: C('fun', 'Build software from a Makefile', 'make [target]', 'make', (ctx) => {
      if (ctx.args.join(' ') === 'me a sandwich') {
        if (ctx.sudo) { OS.achievements.unlock('sandwich'); return 'Okay. 🥪'; }
        ctx.err('make: *** No rule to make target \'me\'.  What? Make it yourself.');
        return '';
      }
      ctx.err('make: *** No targets specified and no makefile found.  Stop.');
      return '';
    }, { hidden: true }),

    bash: C('basics', 'Run a shell script', 'bash <script>', 'bash myscript.sh', async (ctx) => {
      if (!ctx.args[0]) { ctx.err('bash: you are already in bash 🙂'); return ''; }
      const path = ctx.args[0].includes('/') ? ctx.args[0] : `./${ctx.args[0]}`;
      return ctx.shell.runScript({ ...ctx, forceRun: true }, path, ctx.args.slice(1));
    }, { more: 'bash script.sh runs a script even without the x permission,\nbecause bash reads it rather than executing it directly.' }),

    tux: C('fun', 'Ask Tux to say something', 'tux [message]', 'tux hello', (ctx) => {
      OS.bus.emit('tux:say', ctx.args.join(' ') || 'Hi! Need help? Type hint.');
      return '';
    }),
  };

  OS.commands.vi = { ...OS.commands.vim, hidden: true };
  OS.commands.nvim = { ...OS.commands.vim, hidden: true };
  OS.commands.htop = { ...OS.commands.ps, hidden: true };
  OS.commands.more = OS.commands.less;
  OS.commands['apt-get'] = { ...OS.commands.apt, hidden: true };
  OS.commands.open = { ...OS.commands['xdg-open'], hidden: true };
  OS.commands.logout = { ...OS.commands.exit, hidden: true };
  OS.commands.poweroff = { ...OS.commands.shutdown, hidden: true };

  OS.PACKAGES = PACKAGES;
})();
