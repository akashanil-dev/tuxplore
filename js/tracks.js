'use strict';
// Advanced tracks: career paths for players who finished the main quests (Graduation).
//
// A track is a list of quests in the same shape as js/quests.js: id, title, story and objectives, each
// with text, hint, check(type, data) and optionally app. The player follows one track at a time, picked
// in the Quest Journal, and its quests run in order like the main chain. Progress lives in
// OS.state.tracks, apart from OS.state.quests, so the main chain and its ending never change.
//
// Quest ids are stored in players' saves: never rename or reuse one after it ships.

(() => {
  // Helpers for checks, shared with the main quests: cmd('ls') passes when ls succeeds,
  // read(() => `${home()}/notes.txt`) once that file has been read.
  const { home, cmd, read } = OS.quests.helpers;

  const list = [
    {
      id: 'sysadmin',
      title: 'Linux Administrator',
      blurb: 'Users, permissions, services, logs and backups: keep a server healthy.',
      quests: [
        // {
        //   id: 'whoami',
        //   title: 'Who Is Logged In?',
        //   story: 'An admin always knows who is on the machine.',
        //   objectives: [
        //     { text: 'See your user', hint: 'whoami', check: cmd('whoami') },
        //   ],
        // },
      ],
    },
    {
      id: 'devops',
      title: 'DevOps',
      blurb: 'Scripts, automation, containers and pipelines: ship software reliably.',
      quests: [],
    },
  ];

  OS.tracks = {
    list,

    unlocked: () => !!OS.state.quests.done.graduate,
    byId: (id) => list.find((t) => t.id === id) || null,
    key: (t, q) => `${t.id}/${q.id}`,
    isDone(t, q) { return !!OS.state.tracks.done[this.key(t, q)]; },
    doneCount(t) { return t.quests.filter((q) => this.isDone(t, q)).length; },

    // The track being played, once the main quests are done.
    active() {
      return this.unlocked() ? this.byId(OS.state.tracks.active) : null;
    },

    current(t = this.active()) {
      return t?.quests.find((q) => !this.isDone(t, q)) || null;
    },

    progress(t, q) {
      return (OS.state.tracks.progress[this.key(t, q)] ||= q.objectives.map(() => false));
    },

    start(id) {
      const t = this.byId(id);
      if (!t || !this.unlocked()) return;
      OS.state.tracks.active = id;
      OS.save();
      const q = this.current(t);
      OS.bus.emit('tux:say', q ? `Track started: ${t.title}. First quest: ${q.title}. ${q.story}` : `You've finished the ${t.title} track already! 🎓`);
      this.evaluate('activate', {});
      OS.bus.emit('quest:update');
    },

    init() {
      for (const type of OS.quests.EVENTS) OS.bus.on(type, (data) => this.evaluate(type, data || {}));
      this.evaluate('activate', {});
    },

    evaluate(type, data) {
      const t = this.active();
      const q = this.current(t);
      if (!q) return;
      const prog = this.progress(t, q);
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
      if (prog.every(Boolean)) this.complete(t, q);
      OS.bus.emit('quest:update');
    },

    // Usage counts for tracks need new event names on the API (EVENTS in api/src/index.js) first.
    complete(t, q) {
      OS.state.tracks.done[this.key(t, q)] = Date.now();
      OS.save();
      OS.toast({ icon: '📜', title: `Quest complete: ${q.title}`, body: `${this.doneCount(t)} of ${t.quests.length} in ${t.title}` });
      const next = this.current(t);
      setTimeout(() => {
        if (next) {
          OS.bus.emit('tux:say', `New quest: ${next.title}. ${next.story}`);
          this.evaluate('activate', {});
        } else {
          OS.bus.emit('tux:say', `You finished the ${t.title} track! 🎓 Pick another one in the Quest Journal.`);
        }
      }, 1500);
    },

    // For the quest and hint commands and Tux, once the main quests are done. null when there's no track.
    describe() {
      const t = this.active();
      if (!t) return null;
      const q = this.current(t);
      if (!q) return `Track complete: ${t.title}! 🎓 Pick another one in the Quest Journal.`;
      const prog = this.progress(t, q);
      return `${t.title}, quest ${t.quests.indexOf(q) + 1}/${t.quests.length}: ${q.title}\n\n${q.story}\n\n` +
        q.objectives.map((o, i) => `  [${prog[i] ? 'x' : ' '}] ${o.text}`).join('\n') +
        '\n\nStuck? Type hint.';
    },

    hint() {
      const t = this.active();
      const q = this.current(t);
      return q ? OS.quests.hintFor(q, this.progress(t, q)) : null;
    },
  };
})();
