# Tuxplore 🐧

**Boot a Linux desktop in your browser and learn the terminal by playing.**

Play it live at **[tuxplore.akashanil.dev](https://tuxplore.akashanil.dev)** ([about](https://tuxplore.akashanil.dev/about.html) · [stats](https://tuxplore.akashanil.dev/stats.html)).

Tuxplore boots *TuxOS*, a pretend Linux computer that runs entirely in a browser tab. It's made for
people who have never used Linux: instead of reading a tutorial, you boot it, log in, and learn the
terminal by going on quests, solving puzzles and playing games, with Tux the penguin giving hints along
the way. Nothing is installed and nothing on your real computer is touched.

## What's inside

### A real-feeling boot
- **GRUB menu** with a countdown, recovery mode and a (fake) memory test.
- **Boot log** with kernel and systemd messages.
- **Login screen** where you create your Linux username.
- **Phones** get a joke kernel panic instead, with a link to open TuxOS on a computer (or boot anyway, if you insist).

### The TuxOS desktop
- **Four desktop environments,** each with its own panels, menus, window buttons and shortcuts. KDE Plasma comes first, and quests unlock the rest:
  - **KDE Plasma:** a taskbar, the Kickoff app launcher, KRunner search on Alt+Space and Peek at Desktop. Everyone starts here, since it feels familiar coming from Windows.
  - **GNOME:** a top bar and the Activities overview (click it, push the mouse into the top-left corner, or tap Super).
  - **CDE:** the 1990s Unix Front Panel with an analog clock, four workspaces, Motif window menus, and minimised windows that turn into desktop icons.
  - **Hyprland:** a Waybar bar, five workspaces, tiling windows with no title bars, a wofi launcher and keyboard shortcuts on Alt (real Hyprland uses Super, but in a browser your own system catches that key first).
- **Switch any time** in Settings, or pick a session on the login screen.
- **A login screen for each:** SDDM for KDE Plasma, GDM for GNOME, CDE's dtlogin and a text-mode tuigreet for Hyprland. You get the one for the desktop you last used.
- **Windows** you can drag, resize, minimise and maximise, in whatever style the desktop environment uses.
- **Wallpapers, achievements and toasts,** plus Tux in the corner, who reacts to what you do and gives hints when you click him.
- **Progress is saved** in the browser, and online too if you make an account: just a username and password, with no email and no password reset. You can also play without one.

### A terminal you can actually use
A bash-like shell over a virtual filesystem, with about 60 commands:
- **Navigation:** `ls`, `cd`, `pwd`, `tree`, `find`
- **Reading and searching text:** `cat`, `grep`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`, `tr`
- **Changing files:** `mkdir`, `cp`, `mv`, `rm`, `chmod`
- **Admin and software:** `sudo` and the `apt` / `dnf` / `pacman` package managers
- **Editors:** `nano`, plus `vim` (escaping it is an achievement)

It supports pipes (`|`), redirection (`>`, `>>`, `<`), `&&`, wildcards, `$VARIABLES`, tab completion, history and `man` pages. Mistakes teach too:
- **Windows commands** like `dir` get a gentle "on Linux, use `ls`".
- **Missing programs** explain how to install them.
- **Real safety nets are kept:** `rm -rf /` hits the same failsafe as real GNU `rm`.

### Ten quests
*Hello, Terminal → A Letter from Tux → Into the Dungeon → The Library → The Locked Gate → Goblin
Trouble → The Superuser → The Plumber → The App Store → Graduation.*

Each one teaches a real skill: hidden files, `grep -r`, file permissions, wildcards, `sudo`,
pipes, package managers. They're wrapped in a small story about rescuing Tux's stolen crown. The
**Quest Journal** tracks progress, gives hints and builds a printable cheat sheet of every command you've used.

### Games and apps
| App | What it is |
|---|---|
| **Terminal** | The shell above, with `nano`, `vim`, and a few classic easter eggs |
| **Files** | A point-and-click file manager over the same filesystem as the terminal |
| **Quest Journal** | Quests, hints and your personal cheat sheet |
| **Pipe Dream** | 8 puzzles: chain commands like `sort \| uniq -c \| sort -rn` to turn an input into the target output |
| **Know Your Distro** | An endless runner where you collect the distros of your family. Details below |
| **Achievements** | 30 trophies, 13 of them secret |
| **Settings** | Desktop environments, wallpapers, and resetting your progress |
| **Try Linux** | Unlocks at the end: a short quiz that suggests a real distro, and how to try it from a USB stick |

### Know Your Distro
Tux runs across a landscape that cycles from dawn to a starry night with aurora, through clear, snowy
and overcast weather. Distro tiles slide toward him.
- **Pick a team:** Debian, Red Hat, Arch, Slackware or Gentoo, 32 distros in all.
- **Scoring:** run into your team's distros for **+50**. Every wrong one costs **−20** and a life.
- **Speed:** starts slow and **speeds up as you score**, up to 2×. Your team's distros make up at least 40% of the tiles.
- **Rapid mode:** three teams with 10 lives each, scores summed, ending on a finish screen. Made for running competitions at events.
- **Infinite mode:** play forever, switch teams any time, and beat your best total.
- **Controls:** Space / ↑ / tap to jump (up to three more times in mid-air), A / D to walk, hold **M** for the
  distro family map, **P** to pause, **R** to reset.

## What we collect

Tuxplore counts a few things so we can see what works and where players get stuck. The rules:

- **Counts, not people.** No cookies, no IDs, no IP addresses, no usernames.
- **Page views** go to [GoatCounter](https://www.goatcounter.com), an open-source analytics service. Its script is served from this site, not loaded from a third party.
- **Game events** (TuxOS booted, a quest was finished, a desktop was switched to, which distro the quiz suggested) go to Tuxplore's own API, which only adds one to that day's count. The full list is on the stats page and in `api/src/index.js`.
- **Off with one click:** untick "Share anonymous usage counts" in TuxOS Settings. Nothing is sent either if your browser asks sites not to track you (Do Not Track or Global Privacy Control).
- **Public:** every number is on the [stats page](https://tuxplore.akashanil.dev/stats.html).

## Run it

There's no build step and no dependencies. Pick one:

```bash
# 1. Just open the file
xdg-open index.html

# 2. Or serve the folder
python3 -m http.server 8000      # then visit http://localhost:8000

# 3. Or use Docker
docker build -t tuxplore .
docker run --rm -p 8080:80 tuxplore   # then visit http://localhost:8080
```

Fonts load from Google Fonts. Offline, it falls back to system fonts.

## Project layout

```
index.html          page shell and script order
about.html          what Tuxplore is, for people and search engines
stats.html          public usage stats
404.html            page not found
robots.txt, sitemap.xml, site.webmanifest, favicon.*   for search engines, browsers and phones
css/os.css          colours, boot screens, desktop, windows
css/desktops.css    each desktop environment's panels, launchers and window buttons
css/greeters.css    the login screens
css/page.css        the about, stats and 404 pages
css/apps.css        styles for each app
js/cloud.js         online accounts: logs in and syncs your save with the API
js/analytics.js     anonymous usage counts (see What we collect)
js/stats.js         the public stats page (stats.html)
js/vendor/          GoatCounter's counting script (ISC license)
js/core.js          event bus, save state, toasts, achievements, desktop environment list
js/fs.js            virtual filesystem with owners and permissions
js/coreutils.js     text filters shared by the shell and Pipe Dream
js/shell.js         the bash-like shell and its commands
js/quests.js        the quest chain
js/tracks.js        advanced tracks: career paths after Graduation
js/tux.js           Tux, the companion
js/wm.js            window manager, workspaces, desktop icons, menus
js/de.js            the desktop environments: GNOME, KDE Plasma, CDE, Hyprland
js/boot.js          GRUB, boot log, login steps, kernel panic
js/greeters.js      the login screens: SDDM, GDM, dtlogin, tuigreet
js/apps/*.js        Terminal, Files, Journal, Pipe Dream, Know Your Distro, and the system apps
images/icons/       app icons, one set per desktop environment
images/distros/     distro logos
images/wall/        wallpapers (WebP) and their Settings thumbnails
images/app/         app icons and the link-preview image
api/                the save API: a Cloudflare Worker and D1 database (see api/README.md)
tests/smoke.mjs     plays the whole game in a headless browser (see CONTRIBUTING.md)
```

## License

Tuxplore's code is **source-available** under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may
use, change and share it for any noncommercial purpose: learning, teaching, personal projects, and use by
schools, colleges and other noncommercial organizations. Commercial use needs permission: get in touch.

Some files belong to other projects and keep their own licenses: the app icons
([`images/icons/CREDITS.md`](images/icons/CREDITS.md)), the distro logos
([`images/distros/CREDITS.md`](images/distros/CREDITS.md)) and GoatCounter's script (`js/vendor/`, ISC).

## Credits

- **Know Your Distro** started as a standalone game in this repository. The original version is kept on the
  [`legacy`](https://github.com/akashanil-dev/know-your-distro/tree/legacy) branch.
- **App icons** come from each desktop's own icon theme: GNOME's Adwaita app icons, KDE's Breeze and Papirus for Hyprland, plus hand-drawn retro icons for CDE. See [`images/icons/CREDITS.md`](images/icons/CREDITS.md).
- **Distro logos** come from Know Your Distro, the Papirus icon theme and Simple Icons. See
  [`images/distros/CREDITS.md`](images/distros/CREDITS.md). They're trademarks of their projects
  and are only used to identify them.
