'use strict';
// The public stats page (stats.html): draws the anonymous counts from the API's /stats.
// Quest titles and desktop names come from the game's own files, so they never drift apart.

(() => {
  const { el } = OS.util;
  let api = 'https://api.tuxplore.akashanil.dev';
  try { api = localStorage.getItem('tuxos-api') || api; } catch { /* ignore */ }

  // Every event the API accepts, explained. Keep in step with EVENTS in api/src/index.js.
  const EVENTS = [
    ['boot', 'TuxOS started on a computer.'],
    ['phone_screen', 'Someone opened Tuxplore on a phone and got the "use a computer" screen.'],
    ['account_created', 'An online account was created (not which one).'],
    ['guest_started', 'Someone started playing without an account.'],
    ['login', 'Someone logged into an online account (not which one).'],
    ['quest_complete:<quest>', 'A quest was finished, for example quest_complete:dungeon.'],
    ['de_switch:<desktop>', 'Someone switched desktop environment in Settings.'],
    ['distro_match:<distro>', 'The Try Linux quiz suggested a distro.'],
  ];
  const DISTROS = { mint: 'Linux Mint', ubuntu: 'Ubuntu', fedora: 'Fedora', pop: 'Pop!_OS', endeavour: 'EndeavourOS', debian: 'Debian' };

  const fmt = (n) => n.toLocaleString();
  const dayLabel = (iso, opts = { month: 'short', day: 'numeric' }) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

  // One tooltip for the whole page, placed next to the pointer.
  const tip = document.getElementById('tip');
  const hover = (node, text) => {
    node.addEventListener('pointermove', (e) => {
      tip.textContent = text;
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - r.width - 8)}px`;
      tip.style.top = `${Math.max(8, e.clientY - r.height - 12)}px`;
    });
    node.addEventListener('pointerleave', () => { tip.hidden = true; });
  };

  // Horizontal bars with the value written at the end: rows of [label, count, note?].
  const bars = (container, rows) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    container.replaceChildren(...rows.map(([label, count, note]) => {
      const row = el('div', { class: 'bar-row' },
        el('span', { class: 'bar-label', text: label }),
        el('span', { class: 'bar-track' }, el('span', { class: 'bar-fill', style: { width: `${(count / max) * 100}%` } })),
        el('span', { class: 'bar-value', text: note ? `${fmt(count)} · ${note}` : fmt(count) }));
      hover(row, `${label}: ${fmt(count)}${note ? ` (${note})` : ''}`);
      return row;
    }));
  };

  // Boots per day: one bar per day, a light grid, a label every week. Drawn at the container's real
  // width (and redrawn on resize), so the text stays readable on a phone instead of shrinking.
  const columns = (container, days) => {
    const W = Math.max(300, Math.round(container.clientWidth)), H = 220, left = 36, bottom = 26, top = 10;
    const max = Math.max(4, ...days.map((d) => d.count));
    const step = Math.ceil(max / 4);
    const yMax = step * 4;
    const slot = (W - left) / days.length;
    const bw = Math.max(4, slot - 4);
    const y = (v) => top + (H - top - bottom) * (1 - v / yMax);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Boots per day for the last ${days.length} days`);
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (text != null) n.textContent = text;
      svg.append(n);
      return n;
    };
    for (let i = 0; i <= 4; i++) {
      add('line', { x1: left, x2: W, y1: y(step * i), y2: y(step * i), class: i ? 'grid' : 'axis' });
      add('text', { x: left - 8, y: y(step * i) + 4, class: 'tick', 'text-anchor': 'end' }, fmt(step * i));
    }
    days.forEach((d, i) => {
      const x = left + i * slot + (slot - bw) / 2;
      if (d.count) {
        // Rounded at the top, square on the baseline.
        const h = H - bottom - y(d.count);
        const r = Math.min(4, bw / 2, h);
        add('path', { class: 'col', d: `M${x} ${H - bottom}V${y(d.count) + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${H - bottom}Z` });
      }
      const hit = add('rect', { x: left + i * slot, y: top, width: slot, height: H - top - bottom, class: 'hit' });
      hover(hit, `${dayLabel(d.day, { weekday: 'short', month: 'short', day: 'numeric' })}: ${fmt(d.count)} boot${d.count === 1 ? '' : 's'}`);
      // A label every week, and the last day, but not two labels on top of each other.
      if ((i % 7 === 0 && i < days.length - 4) || i === days.length - 1) add('text', { x: x + bw / 2, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, dayLabel(d.day));
    });
    container.replaceChildren(svg);
  };

  const render = (data) => {
    const t = data.totals;
    const sum = (name) => Object.values(data.daily).reduce((n, day) => n + (day[name] || 0), 0);
    const days = Array.from({ length: data.days }, (_, i) => {
      const day = new Date(Date.parse(`${data.from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);
      return { day, count: data.daily[day]?.boot || 0 };
    });

    // Headline numbers: the last 30 days, with all time underneath.
    const tile = (label, name) => el('div', { class: 'tile' },
      el('span', { class: 'tile-label', text: label }),
      el('strong', { text: fmt(sum(name)) }),
      el('small', { text: `${fmt(t[name] || 0)} all time` }));
    document.getElementById('tiles').replaceChildren(
      tile('Boots, last 30 days', 'boot'),
      tile('Accounts created', 'account_created'),
      tile('Guests started', 'guest_started'),
      tile('Graduated', 'quest_complete:graduate'));

    document.getElementById('boots-card').hidden = false;
    const chart = document.getElementById('boots');
    columns(chart, days);
    let width = chart.clientWidth;
    window.addEventListener('resize', () => { if (chart.clientWidth !== width) { width = chart.clientWidth; columns(chart, days); } });
    document.querySelector('#boots-table tbody').replaceChildren(...[...days].reverse().map((d) => el('tr', {}, el('td', { text: dayLabel(d.day, { weekday: 'short', month: 'short', day: 'numeric' }) }), el('td', { text: fmt(d.count) }))));

    // The quest funnel, against everyone who started playing.
    const started = (t.account_created || 0) + (t.guest_started || 0);
    document.getElementById('quests-sub').textContent = started
      ? `Players who finished each quest, all time, out of ${fmt(started)} who started playing.`
      : 'Players who finished each quest, all time.';
    document.getElementById('quests-card').hidden = false;
    bars(document.getElementById('quests'), OS.quests.list.map((q, i) => {
      const n = t[`quest_complete:${q.id}`] || 0;
      return [`${i + 1}. ${q.title}`, n, started ? `${Math.round((n / started) * 100)}%` : null];
    }));

    document.getElementById('des-card').hidden = false;
    bars(document.getElementById('des'), OS.themes.map((th) => [th.name, t[`de_switch:${th.id}`] || 0]));
    document.getElementById('distros-card').hidden = false;
    bars(document.getElementById('distros'), Object.entries(DISTROS)
      .map(([id, name]) => [name, t[`distro_match:${id}`] || 0])
      .sort((a, b) => b[1] - a[1]));

    document.getElementById('status').textContent = data.since
      ? `Counting since ${dayLabel(data.since, { year: 'numeric', month: 'long', day: 'numeric' })}. Updated every few minutes.`
      : 'Nothing counted yet. Check back soon!';
  };

  document.getElementById('tux').innerHTML = OS.tuxSvg();
  document.getElementById('events').replaceChildren(...EVENTS.flatMap(([name, what]) => [el('dt', {}, el('code', { text: name })), el('dd', { text: what })]));
  fetch(`${api}/stats`)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(() => { document.getElementById('status').textContent = "Couldn't load the numbers right now. Try again in a minute."; });
})();
