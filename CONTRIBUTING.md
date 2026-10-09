# Contributing to Tuxplore

Thanks for helping! This page covers how to run the game, where things live, and the few rules that
keep it from breaking for players.

## Before you start: license and your contributions

Tuxplore is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE).

**By contributing (opening a pull request, or pushing to this repository), you agree that Akash A may
use, change and distribute your contribution under the PolyForm Noncommercial License or any other
license, including commercially.** You keep the copyright in your work; this only lets Tuxplore
change its license later without tracking down every contributor. Your first pull request should say
"I agree to the contribution terms in CONTRIBUTING.md".

## Run it

There's no build step. Serve the folder with any static server and open it:

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

Online accounts need the save API in `api/` (see [api/README.md](api/README.md)). You don't need it:
"Play without an account" works fully offline.

## How changes reach players

`master` is the live site. GitHub Pages deploys every push to it within a minute, so:

1. Work on a branch: `git switch -c tracks/sysadmin`.
2. Open a pull request into `master`.
3. The **smoke test** runs on every pull request (below). It must pass.
4. Akash reviews and merges.

## The smoke test

`tests/smoke.mjs` plays the game in a headless browser the way a new player would: it boots as a guest,
finishes all ten quests by typing the commands, follows an advanced track, opens every app in every
desktop environment, shows every login screen and the phone screen, and loads the other pages. Any
JavaScript error, missing file or unfinished quest fails it.

```sh
cd tests
npm install
npx playwright install chromium   # or: CHROMIUM=/usr/bin/chromium npm run smoke
npm run smoke
```

Run it before you push. If it fails, screenshots land in `tests/screenshots/`.

## Where things live

Everything hangs off one global, `OS`, and scripts load in the order listed in `index.html`. The
[project layout](README.md#project-layout) in the README lists every file. The ones you'll touch most:

| File | What's in it |
|---|---|
| `js/tracks.js` | Advanced tracks: career paths after Graduation |
| `js/quests.js` | The ten main quests, and the quest engine |
| `js/shell.js` | The shell and most commands |
| `js/coreutils.js` | Text tools shared with Pipe Dream: `grep`, `sort`, `wc`, flag parsing |
| `js/fs.js` | The virtual filesystem and the files a new player starts with |
| `js/apps/journal.js` | The Quest Journal, including the Tracks tab |

Build DOM with `OS.util.el(tag, attrs, ...children)` rather than HTML strings, and listen and talk to
other parts through `OS.bus` events.

## Adding an advanced track or quest

Tracks are in `js/tracks.js`. A track has an `id`, `title`, `blurb` and a list of `quests`; a track with
no quests shows as "Coming soon". Quests have the same shape as the main ones in `js/quests.js`:

```js
{
  id: 'users',
  title: 'Who Else Is Here?',
  story: 'A server has many users. Admins manage them with useradd, passwd and groups.',
  objectives: [
    { text: 'List every user', hint: 'Users live in /etc/passwd: cat /etc/passwd', check: read(() => '/etc/passwd') },
    // useradd doesn't exist yet: a track like this would add it (see Adding commands below).
    { text: 'Add a user called sam', hint: 'sudo useradd sam', check: (type, data) => type === 'shell:cmd' && data.name === 'useradd' && data.code === 0 },
  ],
}
```

- **Never rename or reuse a quest or track id once it's live.** Players' saves store progress by id
  (`OS.state.tracks.done['sysadmin/users']`).
- A `check(type, data)` sees every game event while its quest is active. The events are listed in
  `EVENTS` in `js/quests.js`; the most useful is `shell:cmd` with `{ name, args, sudo, cwd, code, out }`.
  Checks that ignore `type` and look at state (a file exists, a package is installed) also pass if the
  player did the thing earlier.
- Helpers: `cmd('whoami')` passes when that command succeeds, `read(() => path)` once a file has been
  read, `home()` is the player's home folder.
- Add `app: 'pipedream'` to an objective that happens in an app other than the Terminal, so the hint
  and the Journal's button point there.
- Don't add quests to the main list in `js/quests.js`: the game's ending, achievements and stats all
  count those ten.

## Adding commands and flags

Commands are entries in `OS.commands` in `js/shell.js`:

```js
uptime: C('system', 'Show how long the system has been running', 'uptime', 'uptime', (ctx) => {
  return ` ${new Date().toTimeString().slice(0, 5)} up 42 min,  1 user`;
}),
```

`C(category, description, usage, example, run, extra)`. The category is one of `basics`, `files`,
`text`, `system` or `fun` (how `help` groups them); `extra` can hold `more`, a longer description for
`man`. `run(ctx)` returns the output (a string, or `{ text, html }`). `ctx` has `args`, `stdin`, `sudo`, `resolve(path)`, `print()` and `err()`. Parse
flags with `parseFlags(ctx.args)`. `man`, `help`, tab completion and the cheat sheet pick new commands
up automatically.

Quests watch what commands do, so **existing behaviour is a contract**:

- Keep output that quests check the same (`grep` printing the secret word, `wc -l` counting lines).
- Keep the events a command sends (`ls -a` sends `shell:ls-a`, reads send `fs:read`).
- New flags are safe. Changing what a flag already does, or a command's exit code, needs care.

The smoke test plays every main quest, so it catches most of these.

## Saves

A player's progress is `OS.state`, saved in the browser and, for online accounts, on the server.

- A new field needs a default in `defaultState()` in `js/core.js`. Old saves get the default.
- Never rename or remove a field, or change what its values mean: old saves still have the old shape.
- Saves over 100 KB are rejected by the server. Keep content (quest text, files) in code, not in the save.
- New starting files in `js/fs.js` only reach new players: existing players keep their filesystem.

## Things to leave to Akash

- **The API** (`api/`): it's deployed from Akash's Cloudflare account. If you need something there,
  like counting track completions in the public stats (the allowed event names are `EVENTS` in
  `api/src/index.js`), describe it in your pull request.
- **Domains, hosting and analytics settings.**

## Style

- Plain, friendly English in everything players read. Short sentences; explain jargon the first time.
- Match the code around you: two-space indents, single quotes, semicolons, short comments that say why.
- Commit messages like the existing ones: `feat(tracks): add the users quest`, `fix(shell): ...`.
