'use strict';

(() => {
  const { el, escape: esc } = OS.util;

  OS.registerApp('challenge', {
    title: 'Academy',
    blurb: 'Solve scenario-based tasks in the terminal',
    w: 760, h: 520,
    single: true,
    create(win, opts) {
      let score = 0;
      let currentTaskIndex = 0;
      
      const tasks = OS.academyTasks || [];

      // UI setup
      const header = el('div', { class: 'challenge-header', style: 'background: #2a2a2a; color: white; padding: 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #444; font-family: sans-serif;' });
      
      const questionEl = el('div', { class: 'challenge-question', style: 'font-weight: bold; flex: 1;', text: tasks[currentTaskIndex].question });
      const scoreEl = el('div', { class: 'challenge-score', style: 'margin: 0 15px; font-weight: bold; color: #4ade80;', text: `Score: ${score}` });
      
      header.append(questionEl, scoreEl);

      const out = el('div', { class: 'term-out', 'aria-live': 'polite' });
      const promptEl = el('span', { class: 'term-prompt' });
      const input = el('input', { class: 'term-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Terminal input' });
      const line = el('div', { class: 'term-line' }, promptEl, input);
      const termRoot = el('div', { class: 'term', style: 'height: calc(100% - 46px);' }, out, line);
      
      const root = el('div', { style: 'height: 100%; display: flex; flex-direction: column;' }, header, termRoot);
      win.body.append(root);

      let busy = false;
      let histIdx = null;
      let draft = '';

      const term = {
        cancelled: false,
        print(msg, cls = 'out') {
          const div = el('div', { class: `term-row ${cls}` });
          if (msg && typeof msg === 'object') div.innerHTML = msg.html;
          else div.textContent = msg;
          out.append(div);
          termRoot.scrollTop = termRoot.scrollHeight;
        },
        clear() { out.innerHTML = ''; },
        close() { win.close(); },
        panic: (reason) => OS.boot.panic(reason),
        editor: (o) => { term.print('Editor not supported in Academy mode', 'err'); return Promise.resolve(); },
        matrix: () => Promise.resolve(),
        train: () => Promise.resolve(),
      };

      const shell = new OS.Shell(term, opts.cwd);

      const renderPrompt = () => {
        const p = shell.prompt();
        promptEl.innerHTML = `<span class="p-user">${esc(p.user)}@${p.host}</span>:<span class="p-path">${esc(p.path)}</span>$&nbsp;`;
      };

      const echo = (text) => {
        const div = el('div', { class: 'term-row cmd' });
        div.innerHTML = promptEl.innerHTML + esc(text);
        out.append(div);
      };

      const checkCurrentTask = () => {
        if (currentTaskIndex >= tasks.length) return;
        const task = tasks[currentTaskIndex];
        
        if (task.check(shell)) {
          term.print(task.success, 'c-green c-bold');
          score += 10;
          scoreEl.textContent = `Score: ${score}`;
          currentTaskIndex++;
          if (currentTaskIndex < tasks.length) {
            questionEl.textContent = tasks[currentTaskIndex].question;
            term.print(`\n[Next Task] ${tasks[currentTaskIndex].question}`, 'c-yellow c-bold');
          } else {
            questionEl.textContent = "All tasks completed!";
            term.print(`\n[Congratulations!] You have finished the Academy. Final Score: ${score}`, 'c-green c-bold');
          }
        } else {
          term.print(`Not quite right. Hint: ${task.hint}`, 'err');
        }
      };

      const run = async (text) => {
        echo(text);
        const trimmed = text.trim();
        
        // Handle custom academy commands
        if (trimmed === '/hint') {
          if (currentTaskIndex < tasks.length) term.print(`Hint: ${tasks[currentTaskIndex].hint}`, 'c-yellow c-bold');
          termRoot.scrollTop = termRoot.scrollHeight;
          if (document.body.contains(input)) input.focus();
          return;
        } else if (trimmed === '/answer') {
          if (currentTaskIndex < tasks.length) term.print(`Answer: ${tasks[currentTaskIndex].answer}`, 'c-yellow c-bold');
          termRoot.scrollTop = termRoot.scrollHeight;
          if (document.body.contains(input)) input.focus();
          return;
        }

        busy = true;
        term.cancelled = false;
        line.classList.add('busy');
        try {
          await shell.exec(text);
        } catch (e) {
          term.print(`bash: internal error: ${e.message}`, 'err');
          console.error(e);
        }
        busy = false;
        line.classList.remove('busy');
        
        // After execution, check the task
        if (trimmed && currentTaskIndex < tasks.length) {
          checkCurrentTask();
        }

        renderPrompt();
        termRoot.scrollTop = termRoot.scrollHeight;
        if (document.body.contains(input)) input.focus();
      };

      input.addEventListener('keydown', (e) => {
        if (busy) {
          if (e.ctrlKey && e.key === 'c') { term.cancelled = true; term.print('^C'); }
          e.preventDefault();
          return;
        }
        const hist = OS.state.history;
        if (e.key === 'Enter') {
          const text = input.value;
          input.value = '';
          histIdx = null;
          draft = '';
          if (text.trim() && !text.trim().startsWith('/')) {
            const i = hist.indexOf(text);
            if (i !== -1) hist.splice(i, 1);
            hist.push(text);
            OS.save();
          }
          run(text);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (histIdx === null) draft = input.value;
          histIdx = histIdx === null ? hist.length - 1 : Math.max(0, histIdx - 1);
          if (hist[histIdx] !== undefined) input.value = hist[histIdx];
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (histIdx === null) return;
          histIdx = histIdx === hist.length - 1 ? null : histIdx + 1;
          input.value = histIdx === null ? draft : hist[histIdx];
        } else if (e.ctrlKey && e.key === 'c') {
          e.preventDefault();
          echo(input.value + '^C');
          input.value = '';
          histIdx = null;
          draft = '';
          renderPrompt();
        } else if (e.ctrlKey && e.key === 'l') {
          e.preventDefault();
          term.clear();
        }
      });

      root.addEventListener('mouseup', () => {
        if (!window.getSelection().toString()) input.focus();
      });

      term.print({ html: `<span class="c-green c-bold">Academy Terminal</span>\n\nRead the task above and run commands to solve it.\nType <span class="c-yellow">/hint</span> for a hint or <span class="c-yellow">/answer</span> to see the solution.\n` });
      renderPrompt();
      setTimeout(() => input.focus(), 50);

      return {
        focus: () => { setTimeout(() => input.focus(), 0); },
        run,
      };
    },
  });
})();
