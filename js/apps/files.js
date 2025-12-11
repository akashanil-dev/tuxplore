'use strict';
// File manager over the same virtual filesystem the terminal uses.

(() => {
  const { el } = OS.util;

  const fileGlyph = (name, node) => {
    if (node.t === 'd') return '📁';
    if (node.run || name.endsWith('.sh')) return '⚙️';
    if (name.startsWith('goblin')) return '👺';
    if (name.includes('crown')) return '👑';
    if (name.endsWith('.txt') || name.startsWith('.')) return '📄';
    return '📦';
  };

  OS.registerApp('files', {
    title: 'Files',
    blurb: 'Browse folders the point-and-click way',
    w: 780, h: 480,
    create(win, opts) {
      let cwd = opts.path || OS.fs.home();
      let selected = opts.select || null;
      let showHidden = false;
      const back = [];

      const crumbs = el('div', { class: 'files-crumbs' });
      const grid = el('div', { class: 'files-grid', role: 'listbox', 'aria-label': 'Files' });
      const preview = el('aside', { class: 'files-preview' });
      const statusEl = el('div', { class: 'files-status' });
      const hiddenBtn = el('button', { class: 'btn-ghost', 'aria-pressed': 'false', text: 'Show hidden', onclick: () => { showHidden = !showHidden; hiddenBtn.setAttribute('aria-pressed', String(showHidden)); render(); } });
      const toolbar = el('div', { class: 'files-toolbar' },
        el('button', { class: 'btn-ghost', 'aria-label': 'Back', title: 'Back', text: '←', onclick: () => { if (back.length) go(back.pop(), false); } }),
        el('button', { class: 'btn-ghost', 'aria-label': 'Up one folder', title: 'Up (cd ..)', text: '↑', onclick: () => go(OS.fs.split(cwd)[0]) }),
        crumbs, hiddenBtn,
        el('button', { class: 'btn-primary', text: '>_ Open terminal here', onclick: () => {
          OS.wm.open('terminal', { cwd });
          OS.achievements.unlock('files_terminal');
        } }));
      const places = [['🏠', 'Home', () => OS.fs.home()], ['📄', 'Documents', () => `${OS.fs.home()}/Documents`], ['🏰', 'Dungeon', () => `${OS.fs.home()}/dungeon`], ['💽', 'Computer ( / )', () => '/'], ['🗒️', 'Logs', () => '/var/log']];
      const side = el('nav', { class: 'files-side', 'aria-label': 'Places' });
      const main = el('div', { class: 'files-main' }, grid, preview);
      win.body.append(el('div', { class: 'files' }, toolbar, el('div', { class: 'files-wrap' }, side, main), statusEl));

      function go(path, push = true) {
        const node = OS.fs.lookup(path);
        if (!node || node.t !== 'd') return;
        if (!OS.fs.canExec(node, false) || !OS.fs.canRead(node, false)) {
          showPreview(null, path, 'locked');
          return;
        }
        if (push && path !== cwd) back.push(cwd);
        cwd = path;
        selected = null;
        render();
      }

      function showPreview(node, path, why) {
        preview.innerHTML = '';
        if (why === 'locked') {
          preview.append(el('div', { class: 'files-locked' },
            el('div', { class: 'big', text: '🔒' }), el('strong', { text: 'Permission denied' }),
            el('p', { text: `${path} belongs to root. The file manager runs as you, so it can't look inside.` }),
            el('p', {}, 'In the terminal, ', el('code', { text: 'sudo' }), ' can open it.')));
          return;
        }
        if (!node) {
          preview.append(el('div', { class: 'files-hint' }, el('p', { text: 'Double-click a folder to open it. Click a file to preview it.' }),
            el('p', { class: 'muted' }, 'This is the same filesystem as the terminal. Here you are in ', el('code', { text: OS.fs.pretty(cwd) }), '. In the terminal, ', el('code', { text: `cd ${OS.fs.pretty(cwd)}` }), ' takes you to the same place.')));
          return;
        }
        const name = path.split('/').pop();
        if (!OS.fs.canRead(node, false)) { showPreview(null, path, 'locked'); return; }
        preview.append(
          el('div', { class: 'files-pv-head' }, el('span', { class: 'big', text: fileGlyph(name, node) }), el('strong', { text: name })),
          el('code', { class: 'files-perm', text: `${OS.fs.modeString(node)}  ${node.o === 'user' ? OS.fs.user : 'root'}` }),
          el('pre', { class: 'files-pv-body', text: node.c || '(empty file)' }),
          el('p', { class: 'muted' }, 'Terminal: ', el('code', { text: `cat ${OS.fs.pretty(path)}` })));
        if (node.t === 'f') OS.bus.emit('fs:read', { path, sudo: false });
      }

      function render() {
        crumbs.innerHTML = '';
        const parts = cwd.split('/').filter(Boolean);
        crumbs.append(el('button', { class: 'crumb', text: '/', onclick: () => go('/') }));
        parts.forEach((p, i) => crumbs.append(el('button', { class: 'crumb', text: p, onclick: () => go('/' + parts.slice(0, i + 1).join('/')) })));

        side.innerHTML = '';
        for (const [icon, label, fn] of places) {
          const path = fn();
          if (!OS.fs.lookup(path)) continue;
          side.append(el('button', { class: `side-item${cwd === path ? ' active' : ''}`, onclick: () => go(path) }, `${icon} ${label}`));
        }

        const dir = OS.fs.lookup(cwd);
        if (!dir) { cwd = OS.fs.home(); return render(); }
        grid.innerHTML = '';
        const names = OS.fs.list(cwd, false).filter((n) => showHidden || !n.startsWith('.'));
        names.sort((a, b) => (dir.ch[b].t === 'd') - (dir.ch[a].t === 'd'));
        for (const name of names) {
          const node = dir.ch[name];
          const path = `${cwd === '/' ? '' : cwd}/${name}`;
          const locked = !OS.fs.canRead(node, false);
          const item = el('button', { class: `file-item${selected === path ? ' sel' : ''}${name.startsWith('.') ? ' hidden-file' : ''}`, role: 'option', 'aria-selected': String(selected === path), title: name },
            el('span', { class: 'file-glyph', text: fileGlyph(name, node) }),
            locked && el('span', { class: 'file-lock', text: '🔒' }),
            el('span', { class: 'file-name', text: name }));
          item.addEventListener('click', () => {
            selected = path;
            grid.querySelectorAll('.file-item').forEach((n) => { n.classList.remove('sel'); n.setAttribute('aria-selected', 'false'); });
            item.classList.add('sel');
            item.setAttribute('aria-selected', 'true');
            if (node.t === 'f') showPreview(node, path);
            else if (matchMedia('(pointer: coarse)').matches) go(path);
          });
          item.addEventListener('dblclick', () => (node.t === 'd' ? go(path) : showPreview(node, path)));
          item.addEventListener('keydown', (e) => { if (e.key === 'Enter') (node.t === 'd' ? go(path) : showPreview(node, path)); });
          grid.append(item);
        }
        if (!names.length) grid.append(el('p', { class: 'muted files-empty', text: 'This folder is empty.' }));
        const sel = selected && OS.fs.lookup(selected);
        if (sel && sel.t === 'f') showPreview(sel, selected); else showPreview(null);
        statusEl.textContent = `${names.length} item${names.length === 1 ? '' : 's'}  ·  ${cwd}`;
      }

      const onChange = () => render();
      OS.bus.on('fs:change', onChange);
      win.onClose(() => OS.bus.off('fs:change', onChange));
      render();

      return {
        reopen(o) {
          if (o.path) { if (o.path !== cwd) back.push(cwd); cwd = o.path; }
          selected = o.select || null;
          render();
        },
      };
    },
  });
})();
