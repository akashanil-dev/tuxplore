'use strict';
// Pure text filters shared by the shell and Pipe Dream. Each takes (args, input) and returns output text.

class UsageError extends Error {}

function parseFlags(args, valued = []) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { rest.push(...args.slice(i + 1)); break; }
    if (/^-\d+$/.test(a)) { flags.n = a.slice(1); continue; } // head -3
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (valued.includes(f)) {
          const inline = a.slice(j + 1);
          flags[f] = inline || args[++i];
          if (flags[f] == null) throw new UsageError(`option requires an argument -- '${f}'`);
          break;
        }
        flags[f] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

const toLines = (s) => (s === '' ? [] : s.split('\n'));

function expandSet(set) {
  let out = '';
  for (let i = 0; i < set.length; i++) {
    if (set[i + 1] === '-' && i + 2 < set.length) {
      for (let c = set.charCodeAt(i); c <= set.charCodeAt(i + 2); c++) out += String.fromCharCode(c);
      i += 2;
    } else {
      out += set[i];
    }
  }
  return out;
}

function parseList(spec) {
  const picks = [];
  for (const part of String(spec).split(',')) {
    const [a, b] = part.split('-');
    const start = a ? Number(a) : 1;
    const end = part.includes('-') ? (b ? Number(b) : Infinity) : start;
    if (!Number.isFinite(start)) throw new UsageError(`invalid field list: '${spec}'`);
    picks.push([start, end]);
  }
  return (i) => picks.some(([s, e]) => i >= s && i <= e);
}

function makeMatcher(pattern, ignoreCase) {
  try {
    const re = new RegExp(pattern, ignoreCase ? 'i' : '');
    return (line) => re.test(line);
  } catch {
    const needle = ignoreCase ? pattern.toLowerCase() : pattern;
    return (line) => (ignoreCase ? line.toLowerCase() : line).includes(needle);
  }
}

OS.text = {
  UsageError,
  parseFlags,
  toLines,
  makeMatcher,

  grep(args, input) {
    const { flags, rest } = parseFlags(args);
    if (!rest.length) throw new UsageError('usage: grep [-i] [-v] [-c] [-n] PATTERN [FILE...]');
    const match = makeMatcher(rest[0], flags.i);
    const hits = [];
    toLines(input).forEach((line, idx) => {
      if (match(line) !== !!flags.v) hits.push(flags.n ? `${idx + 1}:${line}` : line);
    });
    return flags.c ? String(hits.length) : hits.join('\n');
  },

  sort(args, input) {
    const { flags } = parseFlags(args, ['k']);
    const field = flags.k ? Number(flags.k) : 0;
    const key = (line) => (field ? line.trim().split(/\s+/)[field - 1] ?? '' : line);
    const lines = toLines(input).slice();
    if (flags.n) lines.sort((a, b) => (parseFloat(key(a)) || 0) - (parseFloat(key(b)) || 0));
    else lines.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    if (flags.r) lines.reverse();
    return (flags.u ? lines.filter((l, i) => l !== lines[i - 1]) : lines).join('\n');
  },

  uniq(args, input) {
    const { flags } = parseFlags(args);
    const groups = [];
    for (const line of toLines(input)) {
      const last = groups[groups.length - 1];
      if (last && last.line === line) last.n++;
      else groups.push({ line, n: 1 });
    }
    return groups
      .filter((g) => !flags.d || g.n > 1)
      .map((g) => (flags.c ? `${String(g.n).padStart(7)} ${g.line}` : g.line))
      .join('\n');
  },

  wc(args, input) {
    const { flags } = parseFlags(args);
    const lines = toLines(input).length;
    const words = input.split(/\s+/).filter(Boolean).length;
    const chars = input.length ? input.length + 1 : 0;
    const picked = [flags.l && lines, flags.w && words, flags.c && chars].filter((v) => v !== undefined && v !== false);
    if (picked.length === 1) return String(picked[0]);
    return [lines, words, chars].map((n) => String(n).padStart(7)).join(' ');
  },

  head(args, input) {
    const { flags } = parseFlags(args, ['n']);
    return toLines(input).slice(0, Number(flags.n ?? 10)).join('\n');
  },

  tail(args, input) {
    const { flags } = parseFlags(args, ['n']);
    const n = Number(flags.n ?? 10);
    return n === 0 ? '' : toLines(input).slice(-n).join('\n');
  },

  tr(args, input) {
    const { flags, rest } = parseFlags(args);
    if (flags.d) {
      const del = expandSet(rest[0] || '');
      return [...input].filter((c) => c === '\n' || !del.includes(c)).join('');
    }
    if (rest.length < 2) throw new UsageError('usage: tr SET1 SET2   (example: tr a-z A-Z)');
    const from = expandSet(rest[0]);
    const to = expandSet(rest[1]);
    return [...input].map((c) => {
      const i = from.indexOf(c);
      return i < 0 ? c : to[Math.min(i, to.length - 1)];
    }).join('');
  },

  cut(args, input) {
    const { flags } = parseFlags(args, ['d', 'f', 'c']);
    if (flags.c) {
      const pick = parseList(flags.c);
      return toLines(input).map((l) => [...l].filter((_, i) => pick(i + 1)).join('')).join('\n');
    }
    if (!flags.f) throw new UsageError('usage: cut -d DELIM -f FIELDS   (example: cut -d, -f1)');
    const delim = flags.d ?? '\t';
    const pick = parseList(flags.f);
    return toLines(input).map((l) => {
      if (!l.includes(delim)) return l;
      return l.split(delim).filter((_, i) => pick(i + 1)).join(delim);
    }).join('\n');
  },

  rev(args, input) {
    return toLines(input).map((l) => [...l].reverse().join('')).join('\n');
  },
};
