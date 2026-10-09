'use strict';
// Quest journal + the cheat sheet of every command the player has learned.

(() => {
  const { el } = OS.util;

  OS.registerApp('journal', {
    title: 'Quest Journal',
    blurb: 'Your quests and your cheat sheet',
    w: 640, h: 560,
    create(win, opts) {
      let tab = opts.tab || 'quests';
      const tabs = el('div', { class: 'tabs', role: 'tablist' });
      const content = el('div', { class: 'journal-content' });
      win.body.append(el('div', { class: 'journal' }, tabs, content));

      // One quest in a list: locked, current (story, steps and buttons) or done. hint() gives the hint text.
      const questCard = (q, num, { isDone, isCur, prog, hint }) => {
        if (!isDone && !isCur) return el('div', { class: 'quest locked' }, el('span', { class: 'quest-num', text: String(num) }), el('span', { text: '???' }));
        // The button opens whatever the next unfinished step happens in (Pipe Dream, Try Linux, or the Terminal).
        const nextApp = q.objectives.find((_, j) => !prog[j])?.app || 'terminal';
        const hintBox = el('p', { class: 'quest-hint', hidden: true });
        return el('article', { class: `quest${isDone ? ' done' : ' current'}` },
          el('header', {}, el('span', { class: 'quest-num', text: isDone ? '✓' : String(num) }), el('h3', { text: q.title }),
            q.reward?.theme && el('span', { class: 'badge', text: `🖥️ ${OS.themes.find((t) => t.id === q.reward.theme).name}` })),
          isCur && el('p', { text: q.story }),
          el('ul', { class: 'objectives' }, q.objectives.map((o, j) =>
            el('li', { class: prog[j] ? 'ok' : '' }, el('span', { class: 'tick', 'aria-hidden': 'true', text: prog[j] ? '✓' : '' }), o.text))),
          isCur && el('div', { class: 'quest-actions' },
            el('button', { class: 'btn-primary', text: `Open ${OS.apps[nextApp].title}`, onclick: () => OS.wm.open(nextApp) }),
            el('button', { class: 'btn-ghost', text: '💡 Hint', onclick: () => { hintBox.hidden = false; hintBox.textContent = hint(); } })),
          hintBox);
      };

      const progressBar = (done, total) => el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
        el('div', { class: 'progress-fill', style: { width: `${total ? (done / total) * 100 : 0}%` } }));

      const renderQuests = () => {
        const cur = OS.quests.current();
        const done = Object.keys(OS.state.quests.done).length;
        content.append(progressBar(done, OS.quests.list.length));
        content.append(el('p', { class: 'muted', text: `${done} of ${OS.quests.list.length} quests complete` }));
        OS.quests.list.forEach((q, i) => content.append(questCard(q, i + 1, {
          isDone: !!OS.state.quests.done[q.id], isCur: q === cur, prog: OS.quests.progress(q), hint: () => OS.quests.hint(),
        })));
      };

      // Advanced tracks (js/tracks.js): career paths after Graduation, one at a time.
      const renderTracks = () => {
        const unlocked = OS.tracks.unlocked();
        const active = OS.tracks.active();
        content.append(el('p', { class: 'muted', text: unlocked
          ? 'Career paths for Linux graduates. Follow one at a time; you can switch whenever you like and keep your progress.'
          : 'Career paths like Linux administrator and DevOps. They unlock when you finish Graduation, the last quest.' }));
        content.append(el('div', { class: 'track-grid' }, OS.tracks.list.map((t) => {
          const n = t.quests.length;
          const done = OS.tracks.doneCount(t);
          const isActive = t === active;
          return el('div', { class: `track${isActive ? ' active' : ''}${unlocked ? '' : ' locked'}` },
            el('strong', { text: `${unlocked ? '' : '🔒 '}${t.title}` }),
            el('small', { text: t.blurb }),
            n ? progressBar(done, n) : null,
            el('span', { class: 'track-meta muted', text: n ? `${done} of ${n} quests` : 'Coming soon' }),
            unlocked && n > 0 && !isActive && el('button', { class: 'btn-ghost', text: done ? 'Continue' : 'Start track', onclick: () => OS.tracks.start(t.id) }),
            isActive && el('span', { class: 'badge', text: 'Following' }));
        })));
        if (!active) return;
        const cur = OS.tracks.current(active);
        content.append(el('h3', { class: 'track-heading', text: active.title }));
        active.quests.forEach((q, i) => content.append(questCard(q, i + 1, {
          isDone: OS.tracks.isDone(active, q), isCur: q === cur, prog: OS.tracks.progress(active, q), hint: () => OS.tracks.hint(),
        })));
      };

      const renderCheats = () => {
        const learned = Object.keys(OS.state.learned).filter((n) => OS.commands[n] && !OS.commands[n].hidden);
        content.append(el('div', { class: 'cheat-head' },
          el('p', { text: learned.length ? `Every command you have used so far (${learned.length}). Print it and stick it next to your screen!` : 'Commands you use in the terminal will be collected here.' }),
          learned.length && el('button', { class: 'btn-ghost', text: '🖨 Print', onclick: () => {
            document.body.classList.add('printing-cheats');
            window.print();
            document.body.classList.remove('printing-cheats');
          } })));
        const table = el('table', { class: 'cheats' },
          el('thead', {}, el('tr', {}, el('th', { text: 'Command' }), el('th', { text: 'What it does' }), el('th', { text: 'Example' }))),
          el('tbody', {}, learned.map((n) => el('tr', {},
            el('td', {}, el('code', { text: n })), el('td', { text: OS.commands[n].desc }), el('td', {}, el('code', { text: OS.commands[n].example }))))));
        content.append(table);
        document.getElementById('print-area').replaceChildren(el('h1', { text: `${OS.state.username}'s Linux cheat sheet` }), table.cloneNode(true));
      };

      const render = () => {
        tabs.innerHTML = '';
        for (const [id, label] of [['quests', '📜 Quests'], ['tracks', '🎓 Tracks'], ['cheats', '📋 Cheat sheet']]) {
          tabs.append(el('button', { class: `tab${tab === id ? ' active' : ''}`, role: 'tab', 'aria-selected': String(tab === id), text: label, onclick: () => { tab = id; render(); } }));
        }
        content.innerHTML = '';
        ({ quests: renderQuests, tracks: renderTracks, cheats: renderCheats })[tab]();
      };

      const refresh = () => render();
      OS.bus.on('quest:update', refresh);
      OS.bus.on('learned', refresh);
      win.onClose(() => { OS.bus.off('quest:update', refresh); OS.bus.off('learned', refresh); });
      render();
      return { reopen(o) { if (o.tab) { tab = o.tab; render(); } } };
    },
  });
})();
