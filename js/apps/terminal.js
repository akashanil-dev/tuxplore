'use strict';
// Terminal app: renders a Shell session and hosts its full-screen programs (nano, vim, sl, cmatrix).

(() => {
  const { el, escape: esc, sleep } = OS.util;

  const TRAIN = String.raw`      ====        ________                ___________
  _D _|  |_______/        \__I_I_____===__|_________|
   |(_)---  |   H\________/ |   |        =|___ ___|
   /     |  |   H  |  |     |   |         ||_| |_||
  |      |  |   H  |__--------------------| [___] |
  | ________|___H__/__|_____/[][]~\_______|       |
  |/ |   |-----------I_____I [][] []  D   |=======|__
__/ =| o |=-~~\  /~~\  /~~\  /~~\ ____Y___________|__
 |/-=|___|=    ||    ||    ||    |_____/~\___/
  \_/      \O=====O=====O=====O_/      \_/`;

  OS.registerApp('terminal', {
    title: 'Terminal',
    blurb: 'Talk to the computer by typing',
    w: 760, h: 470,
    single: false,
    create(win, opts) {
      const out = el('div', { class: 'term-out', 'aria-live': 'polite' });
      const promptEl = el('span', { class: 'term-prompt' });
      const input = el('input', { class: 'term-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Terminal input' });
      const line = el('div', { class: 'term-line' }, promptEl, input);
      const root = el('div', { class: 'term' }, out, line);
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
          root.scrollTop = root.scrollHeight;
        },
        clear() { out.innerHTML = ''; },
        close() { win.close(); },
        panic: (reason) => OS.boot.panic(reason),
        editor: (o) => runEditor(root, o, input),
        matrix: () => runMatrix(root),
        train: () => runTrain(root),
      };

      const shell = new OS.Shell(term, opts.cwd);

      const renderPrompt = () => {
        const p = shell.prompt();
        promptEl.innerHTML = `<span class="p-user">${esc(p.user)}@${p.host}</span>:<span class="p-path">${esc(p.path)}</span>$&nbsp;`;
        win.setTitle(`${p.user}@${p.host}: ${p.path}`);
      };

      const echo = (text) => {
        const div = el('div', { class: 'term-row cmd' });
        div.innerHTML = promptEl.innerHTML + esc(text);
        out.append(div);
      };

      const run = async (text) => {
        echo(text);
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
        renderPrompt();
        root.scrollTop = root.scrollHeight;
        if (document.body.contains(input) && !root.querySelector('.term-overlay')) input.focus();
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
          if (text.trim()) run(text); else { echo(''); }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!hist.length) return;
          if (histIdx == null) { draft = input.value; histIdx = hist.length; }
          histIdx = Math.max(0, histIdx - 1);
          input.value = hist[histIdx];
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (histIdx == null) return;
          histIdx++;
          if (histIdx >= hist.length) { histIdx = null; input.value = draft; } else input.value = hist[histIdx];
        } else if (e.key === 'Tab') {
          e.preventDefault();
          const res = shell.complete(input.value);
          input.value = res.line;
          if (res.options.length > 1) { echo(input.value); term.print(res.options.join('   '), 'dim'); }
        } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
          e.preventDefault();
          term.clear();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
          if (input.selectionStart !== input.selectionEnd) return; // allow copying
          e.preventDefault();
          echo(input.value + '^C');
          input.value = '';
        } else if (e.ctrlKey && e.key.toLowerCase() === 'd' && !input.value) {
          e.preventDefault();
          win.close();
        }
      });

      root.addEventListener('mouseup', () => {
        if (!window.getSelection().toString() && !root.querySelector('.term-overlay')) input.focus();
      });

      term.print({ html: `<span class="c-green c-bold">TuxOS 1.0</span> <span class="c-dim">(GNU/Linux 6.10.0-tuxos x86_64)</span>\n\nType <span class="c-yellow">help</span> to see commands, <span class="c-yellow">quest</span> to see your current quest,\nor <span class="c-yellow">hint</span> if you are stuck.\n` });
      renderPrompt();
      setTimeout(() => input.focus(), 50);

      return {
        focus: () => { if (!root.querySelector('.term-overlay')) setTimeout(() => input.focus(), 0); },
        run,
      };
    },
  });

  // ---------- nano / vim ----------
  function runEditor(root, { mode, path, label, content, sudo }, input) {
    return new Promise((resolve) => {
      const vim = mode === 'vim';
      const ta = el('textarea', { class: 'ed-text', spellcheck: 'false', 'aria-label': `${mode} editor` });
      ta.value = content;
      const status = el('div', { class: 'ed-status' });
      const cmdline = el('input', { class: 'ed-cmd', 'aria-label': 'vim command line', hidden: true });
      let modified = false;
      let confirmExit = false;
      let insert = false;
      let confusion = 0;

      const header = vim ? null : el('div', { class: 'ed-head' }, el('span', { text: 'GNU nano 7.2' }), el('span', { class: 'ed-file', text: label }), el('span', { class: 'ed-mod' }));
      const keyBtn = (k, txt, fn) => el('button', { class: 'ed-key', onclick: fn }, el('b', { text: k }), ` ${txt}`);
      const footer = vim ? null : el('div', { class: 'ed-foot' },
        keyBtn('^O', 'Write Out', () => save()), keyBtn('^X', 'Exit', () => exitNano()),
        el('span', { class: 'ed-key' }, el('b', { text: '^K' }), ' Cut'), el('span', { class: 'ed-key' }, el('b', { text: '^U' }), ' Paste'));
      const overlay = el('div', { class: `term-overlay editor ${mode}` }, header, ta, status, cmdline, footer);
      root.append(overlay);

      const setStatus = (msg) => { status.textContent = msg; };
      const setMod = (m) => { modified = m; if (header) header.querySelector('.ed-mod').textContent = m ? 'Modified' : ''; };

      const save = () => {
        if (!path) { setStatus('E32: No file name'); return false; }
        try {
          OS.fs.write(path, ta.value, { sudo });
          setMod(false);
          setStatus(vim ? `"${label}" ${ta.value.split('\n').length}L written` : `[ Wrote ${ta.value.split('\n').length} lines ]`);
          OS.learn(vim ? 'vim' : 'nano');
          return true;
        } catch (e) {
          setStatus(vim ? `E212: Can't open file for writing (${e.message})` : `[ Error writing ${label}: ${e.message} ]`);
          return false;
        }
      };

      const finish = () => {
        overlay.remove();
        if (vim) OS.achievements.unlock('vim_escape');
        resolve();
        setTimeout(() => input.focus(), 0);
      };

      const exitNano = () => {
        if (!modified) return finish();
        confirmExit = true;
        setStatus('Save modified buffer?   Y Yes   N No   ^C Cancel');
      };

      if (vim) {
        ta.readOnly = true;
        setStatus(`"${label}" ${content ? content.split('\n').length + 'L' : '[New]'}`);
        const vimCmd = (c) => {
          cmdline.hidden = true;
          ta.focus();
          if (/^(q|quit)$/.test(c)) return modified ? setStatus('E37: No write since last change (add ! to override)') : finish();
          if (/^(q!|qa!|quit!)$/.test(c)) return finish();
          if (/^(wq|x|wq!)$/.test(c)) return save() && finish();
          if (c === 'w') return save();
          setStatus(`E492: Not an editor command: ${c}`);
        };
        cmdline.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); vimCmd(cmdline.value.replace(/^:/, '').trim()); }
          if (e.key === 'Escape') { cmdline.hidden = true; ta.focus(); }
        });
        ta.addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.key === 'c') { e.preventDefault(); setStatus('Type  :qa!  and press <Enter> to abandon all changes and exit Vim'); return; }
          if (insert) {
            if (e.key === 'Escape') { e.preventDefault(); insert = false; ta.readOnly = true; setStatus(''); }
            return;
          }
          if (e.key === 'i' || e.key === 'a' || e.key === 'o') { e.preventDefault(); insert = true; ta.readOnly = false; setStatus('-- INSERT --'); return; }
          if (e.key === ':') { e.preventDefault(); cmdline.hidden = false; cmdline.value = ':'; cmdline.focus(); return; }
          if (e.key.length === 1 || e.key === 'Escape') {
            e.preventDefault();
            if (++confusion === 6) OS.bus.emit('tux:say', 'Stuck in vim? Everyone is, once. Press Esc, then type :q! and press Enter.');
          }
        });
        ta.addEventListener('input', () => setMod(true));
      } else {
        setStatus(content ? `[ Read ${content.split('\n').length} lines ]` : '[ New File ]');
        ta.addEventListener('input', () => setMod(true));
        overlay.addEventListener('keydown', (e) => {
          const k = e.key.toLowerCase();
          if (confirmExit) {
            e.preventDefault();
            if (k === 'y') { if (save()) finish(); }
            else if (k === 'n') finish();
            else if (e.ctrlKey && k === 'c') { confirmExit = false; setStatus('[ Cancelled ]'); }
            return;
          }
          if (e.ctrlKey && k === 'o') { e.preventDefault(); save(); }
          else if (e.ctrlKey && k === 'x') { e.preventDefault(); exitNano(); }
        });
      }
      setTimeout(() => ta.focus(), 0);
    });
  }

  // ---------- cmatrix ----------
  function runMatrix(root) {
    return new Promise((resolve) => {
      const canvas = el('canvas', { class: 'term-overlay matrix', tabindex: '0', 'aria-label': 'Digital rain. Press any key to exit.' });
      root.append(canvas);
      const ctx = canvas.getContext('2d');
      const w = (canvas.width = root.clientWidth);
      const h = (canvas.height = root.clientHeight);
      const size = 15;
      const drops = Array.from({ length: Math.ceil(w / size) }, () => Math.random() * -40);
      const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ01234567890TUXLINUX';
      let raf;
      const draw = () => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(0, 0, w, h);
        ctx.font = `${size}px monospace`;
        drops.forEach((y, i) => {
          ctx.fillStyle = Math.random() > 0.95 ? '#d1fae5' : '#22c55e';
          ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], i * size, y * size);
          drops[i] = y * size > h && Math.random() > 0.975 ? 0 : y + 0.5;
        });
        raf = requestAnimationFrame(draw);
      };
      draw();
      const stop = () => {
        cancelAnimationFrame(raf);
        canvas.remove();
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(stop, 9000);
      canvas.addEventListener('keydown', stop);
      canvas.addEventListener('pointerdown', stop);
      canvas.focus();
    });
  }

  // ---------- sl ----------
  async function runTrain(root) {
    const pre = el('pre', { class: 'term-overlay train', 'aria-label': 'A steam locomotive drives past' }, TRAIN);
    root.append(pre);
    const from = root.clientWidth;
    const to = -pre.scrollWidth - 20;
    const dur = OS.util.reducedMotion() ? 400 : 3500;
    const start = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        pre.style.transform = `translateX(${from + (to - from) * t}px)`;
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    pre.remove();
    await sleep(0);
  }
})();
