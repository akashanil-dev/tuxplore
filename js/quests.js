'use strict';
// The quest chain. Each objective's check(type, data) sees every game event while its quest is active.
// Checks that ignore `type` are state checks, so they also pass if the player did the thing early.

(() => {
  const home = () => OS.fs.home();
  const dungeon = () => `${home()}/dungeon`;
  const cmd = (name) => (t, d) => t === 'shell:cmd' && d.name === name && d.code === 0;
  // Reads are remembered, so reading a file before its quest still counts.
  const read = (path) => () => !!OS.state.seen?.[path()];

  const errorCount = () => {
    const log = OS.fs.lookup('/var/log/syslog');
    return log ? log.c.split('\n').filter((l) => l.includes('ERROR')).length : -1;
  };

  const list = [
    {
      id: 'hello',
      title: 'Hello, Terminal',
      story: 'The terminal is a way to talk to your computer by typing. It looks scary, but it is just a conversation. Open the Terminal app (or press Ctrl+Alt+T) and ask the computer three simple questions.',
      objectives: [
        { text: 'Ask who you are: whoami', hint: 'Type whoami and press Enter.', check: cmd('whoami') },
        { text: 'Ask where you are: pwd', hint: 'pwd stands for "print working directory". It shows the folder you are in.', check: cmd('pwd') },
        { text: 'Look around: ls', hint: 'ls lists the files in the current folder.', check: cmd('ls') },
      ],
    },
    {
      id: 'letter',
      title: 'A Letter from Tux',
      story: 'There is a file called welcome.txt in your home folder. In the terminal, you read files with cat (short for "concatenate").',
      objectives: [
        { text: 'Read the letter: cat welcome.txt', hint: 'Make sure you are in your home folder (cd ~), then type cat welcome.txt. Tip: type cat we and press Tab!', check: read(() => `${home()}/welcome.txt`) },
      ],
    },
    {
      id: 'dungeon',
      title: 'Into the Dungeon',
      story: 'Folders are called directories. You move between them with cd (change directory). Some files are hidden: their names start with a dot, and plain ls does not show them.',
      reward: { theme: 'gnome' },
      objectives: [
        { text: 'Enter the dungeon: cd dungeon', hint: 'From your home folder, type cd dungeon. Type cd .. to go back up.', check: (t, d) => (t === 'shell:cwd' || t === 'shell:cmd') && d.cwd === dungeon() },
        { text: 'Reveal hidden files: ls -a', hint: 'The -a option means "all". Type ls -a inside the dungeon.', check: (t) => t === 'shell:ls-a' },
        { text: 'Read the hidden map', hint: 'The hidden file is called .map (with the dot). Try cat .map', check: read(() => `${dungeon()}/.map`) },
      ],
    },
    {
      id: 'library',
      title: 'The Library',
      story: 'The gate needs a secret word, hidden in one of a dozen books. Reading them all would take ages. grep searches inside files for you, and -r makes it search every file in a folder.',
      objectives: [
        { text: 'Find the secret word with grep', hint: 'From the dungeon folder, type: grep -r secret library', check: (t, d) => t === 'shell:cmd' && d.name === 'grep' && /freedom/i.test(d.out) },
      ],
    },
    {
      id: 'gate',
      title: 'The Locked Gate',
      story: 'gate.sh is a script: a file full of commands. But Linux will not run a file unless it has execute permission (x). ls -l shows permissions. chmod changes them.',
      objectives: [
        { text: 'Make the gate runnable: chmod +x gate.sh', hint: 'First try ./gate.sh and see the error. Then type chmod +x gate.sh and look at ls -l again.', check: () => { const g = OS.fs.lookup(`${dungeon()}/gate.sh`); return !!g && OS.fs.canExec(g, false); } },
        { text: 'Open the gate with the secret word', hint: './gate.sh runs the script in this folder. Add the secret word after it: ./gate.sh <word>', check: () => !!OS.fs.lookup(`${dungeon()}/crypt`) },
      ],
    },
    {
      id: 'goblins',
      title: 'Goblin Trouble',
      story: 'The crypt is full of goblins blocking the stairs. rm removes files, permanently: there is no recycle bin in the terminal. The * wildcard matches every file name at once.',
      reward: { theme: 'retro' },
      objectives: [
        { text: 'Remove every goblin', hint: 'cd crypt, then rm goblins/*  (the * means "everything in goblins/")', check: () => {
          const g = OS.fs.lookup(`${dungeon()}/crypt/goblins`);
          return !!OS.fs.lookup(`${dungeon()}/crypt`) && (!g || Object.keys(g.ch || {}).length === 0);
        } },
        { text: 'Take the stairs: ./stairs.sh', hint: 'In the crypt folder, type ./stairs.sh', check: (t, d) => t === 'action' && d.id === 'stairs' },
      ],
    },
    {
      id: 'crown',
      title: 'The Superuser',
      story: 'The crown is in /root, which belongs to root: the all-powerful administrator account. Prefix a command with sudo ("superuser do") to run it as root. With great power comes great responsibility.',
      objectives: [
        { text: 'Read the crown: sudo cat /root/crown.txt', hint: 'Try cat /root/crown.txt first. Permission denied? Add sudo in front.', check: () => !!OS.state.seen?.['sudo:/root/crown.txt'] },
        { text: 'Make a trophies folder in your home', hint: 'mkdir makes directories: mkdir ~/trophies', check: () => OS.fs.lookup(`${home()}/trophies`)?.t === 'd' },
        { text: 'Copy the crown into it', hint: 'cp copies files. The crown needs root to read: sudo cp /root/crown.txt ~/trophies/', check: () => !!OS.fs.lookup(`${home()}/trophies/crown.txt`) },
      ],
    },
    {
      id: 'pipes',
      title: 'The Plumber',
      story: 'The real power of Linux: small tools that each do one thing well, chained with pipes |. The output of one command flows into the next. Practise in Pipe Dream, then try it for real.',
      objectives: [
        { text: 'Solve 3 levels in the Pipe Dream app', app: 'pipedream', hint: 'Solve levels by chaining commands with |.', check: () => Object.keys(OS.state.pipe.solved).length >= 3 },
        { text: 'Count the ERROR lines in /var/log/syslog with a pipe', hint: 'grep finds the lines and wc -l counts them: grep ERROR /var/log/syslog | wc -l', check: (t, d) => t === 'shell:line' && d.piped && d.output.trim() === String(errorCount()) },
      ],
    },
    {
      id: 'packages',
      title: 'The App Store',
      story: 'On Linux you install software with a package manager. It downloads programs from trusted repositories and keeps them all updated. Debian and Ubuntu use apt, Fedora uses dnf, Arch uses pacman. Installing needs sudo.',
      objectives: [
        { text: 'Install cowsay', hint: 'sudo apt install cowsay   (or sudo dnf install cowsay, or sudo pacman -S cowsay)', check: () => !!OS.state.installed.cowsay },
        { text: 'Make the cow talk', hint: 'cowsay Hello!   Bonus: fortune | cowsay', check: (t) => t === 'cowsay' },
      ],
    },
    {
      id: 'graduate',
      title: 'Graduation',
      story: 'You did it! You know more terminal than most people ever will. Show off your system with neofetch, then open the new "Try Linux" app to take the next step: the real thing.',
      reward: { theme: 'tiling' },
      objectives: [
        { text: 'Show off: neofetch', hint: 'Just type neofetch.', check: cmd('neofetch') },
        { text: 'Open the Try Linux app', app: 'install', hint: 'It just appeared with your other apps.', check: (t, d) => t === 'app:open' && d.id === 'install' },
      ],
    },
  ];

  const EVENTS = ['shell:cmd', 'shell:line', 'shell:cwd', 'shell:ls-a', 'fs:read', 'fs:chmod', 'fs:change', 'action', 'pkg:install', 'cowsay', 'app:open', 'pipe:solved'];

  OS.quests = {
    list,

    current() {
      return list.find((q) => !OS.state.quests.done[q.id]) || null;
    },

    progress(q) {
      return (OS.state.quests.progress[q.id] ||= q.objectives.map(() => false));
    },

    init() {
      OS.bus.on('fs:read', ({ path, sudo }) => {
        OS.state.seen ||= {};
        OS.state.seen[path] = true;
        if (sudo) OS.state.seen[`sudo:${path}`] = true;
      });
      for (const type of EVENTS) OS.bus.on(type, (data) => this.evaluate(type, data || {}));
      this.evaluate('activate', {});
    },

    evaluate(type, data) {
      const q = this.current();
      if (!q) return;
      const prog = this.progress(q);
      let changed = false;
      q.objectives.forEach((o, i) => {
        if (!prog[i] && o.check(type, data)) {
          prog[i] = true;
          changed = true;
          if (prog.some((p) => !p)) OS.bus.emit('tux:say', `✓ ${o.text}`);
        }
      });
      if (!changed) return;
      OS.save();
      if (prog.every(Boolean)) this.complete(q);
      OS.bus.emit('quest:update');
    },

    complete(q) {
      OS.state.quests.done[q.id] = Date.now();
      OS.save();
      const n = Object.keys(OS.state.quests.done).length;
      OS.toast({ icon: '📜', title: `Quest complete: ${q.title}`, body: `${n} of ${list.length} done` });
      if (q.reward?.theme) setTimeout(() => OS.unlockTheme(q.reward.theme), 600);
      if (n >= 5) OS.achievements.unlock('quest_half');
      if (n >= list.length) OS.achievements.unlock('quest_all');
      const next = this.current();
      if (next) {
        setTimeout(() => {
          OS.bus.emit('tux:say', `New quest: ${next.title}. ${next.story}`);
          this.evaluate('activate', {});
        }, 1500);
      } else {
        setTimeout(() => OS.bus.emit('tux:say', 'You finished every quest! You are officially a Linux user. 🎓 Now go try the real thing.'), 1500);
      }
      if (q.id === 'packages') OS.bus.emit('apps:changed');
    },

    describe() {
      const q = this.current();
      if (!q) return 'All quests complete! 🎓 Open the "Try Linux" app to take the next step.';
      const prog = this.progress(q);
      const idx = list.indexOf(q) + 1;
      return `Quest ${idx}/${list.length}: ${q.title}\n\n${q.story}\n\n` +
        q.objectives.map((o, i) => `  [${prog[i] ? 'x' : ' '}] ${o.text}`).join('\n') +
        '\n\nStuck? Type hint.';
    },

    // Most steps happen in the Terminal: if the app a step needs isn't open, say how to open it first.
    hint() {
      const q = this.current();
      if (!q) return 'No quests left. Try exploring: ls /, cat /etc/os-release, fortune...';
      const prog = this.progress(q);
      const o = q.objectives.find((_, i) => !prog[i]) || q.objectives[0];
      const app = o.app || 'terminal';
      const open = OS.wm?.visibleWindows?.().some((w) => w.appId === app);
      if (OS.wm?.de && !open && OS.apps[app] && !OS.wm.isLocked(app)) {
        const title = OS.apps[app].title;
        const shortcut = app === 'terminal' ? 'press Ctrl+Alt+T, or ' : '';
        return `💡 First open the ${title}: ${shortcut}${OS.wm.de.openHow(title)}.`;
      }
      return `💡 ${o.hint}`;
    },
  };
})();
