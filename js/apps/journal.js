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

      const renderQuests = () => {
        const cur = OS.quests.current();
        const done = Object.keys(OS.state.quests.done).length;
        content.append(el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(OS.quests.list.length), 'aria-valuenow': String(done) },
          el('div', { class: 'progress-fill', style: { width: `${(done / OS.quests.list.length) * 100}%` } })));
        content.append(el('p', { class: 'muted', text: `${done} of ${OS.quests.list.length} quests complete` }));
        OS.quests.list.forEach((q, i) => {
          const isDone = !!OS.state.quests.done[q.id];
          const isCur = q === cur;
          if (!isDone && !isCur) {
            content.append(el('div', { class: 'quest locked' }, el('span', { class: 'quest-num', text: String(i + 1) }), el('span', { text: '???' })));
            return;
          }
          const prog = OS.quests.progress(q);
          const hintBox = el('p', { class: 'quest-hint', hidden: true });
          content.append(el('article', { class: `quest${isDone ? ' done' : ' current'}` },
            el('header', {}, el('span', { class: 'quest-num', text: isDone ? '✓' : String(i + 1) }), el('h3', { text: q.title }),
              q.reward?.theme && el('span', { class: 'badge', text: `🎨 ${OS.themes.find((t) => t.id === q.reward.theme).name}` })),
            isCur && el('p', { text: q.story }),
            el('ul', { class: 'objectives' }, q.objectives.map((o, j) =>
              el('li', { class: prog[j] ? 'ok' : '' }, el('span', { class: 'tick', 'aria-hidden': 'true', text: prog[j] ? '✓' : '' }), o.text))),
            isCur && el('div', { class: 'quest-actions' },
              el('button', { class: 'btn-primary', text: 'Open Terminal', onclick: () => OS.wm.open('terminal') }),
              el('button', { class: 'btn-ghost', text: '💡 Hint', onclick: () => { hintBox.hidden = false; hintBox.textContent = OS.quests.hint(); } })),
            hintBox));
        });
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
        for (const [id, label] of [['quests', '📜 Quests'], ['cheats', '📋 Cheat sheet']]) {
          tabs.append(el('button', { class: `tab${tab === id ? ' active' : ''}`, role: 'tab', 'aria-selected': String(tab === id), text: label, onclick: () => { tab = id; render(); } }));
        }
        content.innerHTML = '';
        if (tab === 'quests') renderQuests(); else renderCheats();
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
