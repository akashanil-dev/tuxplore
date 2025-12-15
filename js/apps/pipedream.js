'use strict';
// Pipe Dream: build a pipeline from command blocks to turn the input into the target output.
// Targets are computed by running each level's solution through the same coreutils the shell uses.

(() => {
  const { el } = OS.util;

  const LEVELS = [
    {
      id: 'fruit', title: 'Pick the apples', file: 'fruits.txt',
      story: 'grep keeps only the lines that contain a word. Keep every line that mentions apple.',
      input: 'apple\nbanana\ncherry\npineapple\nbanana bread\napple pie\nkiwi',
      solution: [['grep', 'apple']],
      blocks: [['grep', 'apple'], ['grep', 'banana'], ['sort'], ['wc', '-l']],
    },
    {
      id: 'abc', title: 'Alphabet soup', file: 'names.txt',
      story: 'sort puts lines in alphabetical order.',
      input: 'tux\nlinus\nada\ngrace\nken\ndennis',
      solution: [['sort']],
      blocks: [['sort'], ['sort', '-r'], ['head', '-3'], ['rev']],
    },
    {
      id: 'count', title: 'How bad is it?', file: 'server.log',
      story: 'Chain two tools: find the ERROR lines, then count them with wc -l.',
      input: 'INFO boot ok\nERROR disk full\nINFO user login\nERROR network down\nWARN slow\nERROR fan on fire\nINFO all good',
      solution: [['grep', 'ERROR'], ['wc', '-l']],
      blocks: [['grep', 'ERROR'], ['grep', 'INFO'], ['wc', '-l'], ['sort'], ['head', '-1']],
    },
    {
      id: 'dedupe', title: 'Seeing double', file: 'guests.txt',
      story: 'uniq removes repeated lines, but only when they are next to each other. Get a clean, sorted guest list.',
      input: 'mint\narch\nmint\nfedora\narch\ndebian\nmint',
      solution: [['sort'], ['uniq']],
      blocks: [['uniq'], ['sort'], ['sort', '-r'], ['wc', '-l'], ['tail', '-2']],
    },
    {
      id: 'top3', title: 'High scores', file: 'scores.txt',
      story: 'sort -n sorts numbers properly (so 9 comes before 10). -r reverses. Show the top 3 scores, highest first.',
      input: '42 tux\n9 gnu\n100 linus\n77 ada\n10 grace\n88 ken',
      solution: [['sort', '-rn'], ['head', '-3']],
      blocks: [['sort'], ['sort', '-n'], ['sort', '-rn'], ['head', '-3'], ['tail', '-3']],
    },
    {
      id: 'shout', title: 'LOUD NOISES', file: 'chat.txt',
      story: 'tr translates characters. tr a-z A-Z turns lowercase into uppercase. Shout only the lines about linux.',
      input: 'i love linux\nwhat is for lunch\nlinux runs everywhere\ncats are great',
      solution: [['grep', 'linux'], ['tr', 'a-z', 'A-Z']],
      blocks: [['tr', 'a-z', 'A-Z'], ['grep', 'linux'], ['grep', '-v', 'linux'], ['rev'], ['sort']],
    },
    {
      id: 'logins', title: 'Who logged in?', file: 'events.csv',
      story: 'cut -d, -f1 keeps only the first column of comma-separated lines. List each person who logged in, once, in order.',
      input: 'sam,09:00,login\nalex,09:05,logout\nkim,09:10,login\nsam,09:30,login\nalex,10:00,login\nkim,11:00,logout',
      solution: [['grep', 'login'], ['cut', '-d,', '-f1'], ['sort'], ['uniq']],
      blocks: [['grep', 'logout'], ['grep', ',login'], ['grep', 'login'], ['cut', '-d,', '-f1'], ['cut', '-d,', '-f2'], ['sort'], ['uniq']],
    },
    {
      id: 'popular', title: 'Distro election', file: 'votes.txt',
      story: 'The classic: sort | uniq -c | sort -rn counts how often each line appears, most popular first. Find the winner (just the top line).',
      input: 'mint\narch\nfedora\nmint\ndebian\narch\nmint\nubuntu\narch\nmint',
      solution: [['sort'], ['uniq', '-c'], ['sort', '-rn'], ['head', '-1']],
      blocks: [['sort'], ['uniq', '-c'], ['sort', '-rn'], ['head', '-1'], ['uniq'], ['tail', '-1'], ['wc', '-l']],
    },
  ];

  const MAX_STAGES = 6;
  const runStage = ([cmd, ...args], input) => {
    try { return OS.text[cmd](args, input); } catch (e) { return `${cmd}: ${e.message}`; }
  };
  const runAll = (stages, input) => stages.reduce((acc, s) => runStage(s, acc), input);
  LEVELS.forEach((l) => { l.target = runAll(l.solution, l.input); });

  OS.pipeLevels = LEVELS;

  OS.registerApp('pipedream', {
    title: 'Pipe Dream',
    blurb: 'Puzzle: chain commands with pipes',
    w: 900, h: 600,
    create(win) {
      let levelIdx = Math.max(0, LEVELS.findIndex((l) => !OS.state.pipe.solved[l.id]));
      let stages = [];

      const levelList = el('ol', { class: 'pd-levels', 'aria-label': 'Levels' });
      const main = el('div', { class: 'pd-main' });
      win.body.append(el('div', { class: 'pd' }, el('aside', { class: 'pd-side' }, el('h3', { text: 'Levels' }), levelList), main));

      const renderLevels = () => {
        levelList.innerHTML = '';
        LEVELS.forEach((l, i) => {
          levelList.append(el('li', {}, el('button', {
            class: `pd-level${i === levelIdx ? ' active' : ''}${OS.state.pipe.solved[l.id] ? ' solved' : ''}`,
            onclick: () => { levelIdx = i; stages = []; render(); },
          }, el('span', { class: 'pd-check', text: OS.state.pipe.solved[l.id] ? '✓' : String(i + 1) }), l.title)));
        });
      };

      const blockLabel = (s) => s.join(' ');

      const render = () => {
        renderLevels();
        const lvl = LEVELS[levelIdx];
        const output = runAll(stages, lvl.input);
        const solved = stages.length > 0 && output === lvl.target;
        main.innerHTML = '';

        // Pipeline with intermediate output under each block.
        const pipe = el('div', { class: 'pd-pipe' });
        const stage = (label, out, removable, i) => el('div', { class: `pd-stage${removable ? '' : ' source'}` },
          el(removable ? 'button' : 'div', {
            class: 'pd-block', title: removable ? 'Click to remove' : 'The input file',
            onclick: removable ? () => { stages.splice(i, 1); render(); } : null,
          }, label, removable ? el('span', { class: 'pd-x', 'aria-hidden': 'true', text: '×' }) : null),
          el('pre', { class: 'pd-out', text: out || '(nothing)' }));
        pipe.append(stage(`cat ${lvl.file}`, lvl.input, false));
        let acc = lvl.input;
        stages.forEach((s, i) => {
          acc = runStage(s, acc);
          pipe.append(el('div', { class: 'pd-arrow', 'aria-hidden': 'true', text: '|' }), stage(blockLabel(s), acc, true, i));
        });
        if (stages.length < MAX_STAGES && !solved) pipe.append(el('div', { class: 'pd-arrow pd-ghost', 'aria-hidden': 'true', text: '|' }), el('div', { class: 'pd-slot', text: 'add a block ↓' }));

        const palette = el('div', { class: 'pd-palette' },
          lvl.blocks.map((b) => el('button', {
            class: 'pd-block pd-pick', disabled: stages.length >= MAX_STAGES || solved,
            onclick: () => { stages.push(b); render(); },
          }, blockLabel(b))));

        const cmdline = `$ cat ${lvl.file}${stages.map((s) => ` | ${blockLabel(s)}`).join('')}`;

        main.append(
          el('div', { class: 'pd-head' },
            el('h2', { text: `${levelIdx + 1}. ${lvl.title}` }),
            el('p', { text: lvl.story })),
          el('div', { class: 'pd-target-wrap' },
            el('div', { class: `pd-target${solved ? ' ok' : ''}` }, el('h4', { text: solved ? '✓ Target reached!' : 'Target output' }), el('pre', { text: lvl.target })),
            el('div', { class: `pd-target mine${solved ? ' ok' : ''}` }, el('h4', { text: 'Your output' }), el('pre', { text: output || '(nothing yet)' }))),
          el('h4', { class: 'pd-label', text: 'Your pipeline' }), pipe,
          el('code', { class: 'pd-cmdline', text: cmdline }),
          solved
            ? el('div', { class: 'pd-win' },
              el('p', {}, 'Solved! In a real terminal you would type exactly the line above.'),
              levelIdx < LEVELS.length - 1
                ? el('button', { class: 'btn-primary', text: 'Next level →', onclick: () => { levelIdx++; stages = []; render(); } })
                : el('p', { class: 'muted', text: 'That was the last level. You are a master plumber. 🚰' }))
            : el('div', {}, el('h4', { class: 'pd-label', text: 'Blocks (click to add)' }), palette,
              el('button', { class: 'btn-ghost', text: 'Reset', onclick: () => { stages = []; render(); } })),
        );

        if (solved && !OS.state.pipe.solved[lvl.id]) {
          OS.state.pipe.solved[lvl.id] = Date.now();
          OS.save();
          const n = Object.keys(OS.state.pipe.solved).length;
          OS.toast({ icon: '🚰', title: `Level solved: ${lvl.title}`, body: `${n} of ${LEVELS.length}` });
          OS.achievements.unlock('first_pipe');
          if (n === LEVELS.length) OS.achievements.unlock('pipe_all');
          OS.bus.emit('pipe:solved', { id: lvl.id, count: n });
          renderLevels();
        }
      };
      render();
    },
  });
})();
