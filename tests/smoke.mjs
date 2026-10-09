// Smoke test: plays Tuxplore in a headless browser the way a new player would and fails on any error.
//
//   cd tests && npm install && npx playwright install chromium && npm run smoke
//
// It boots as a guest, finishes all ten quests by typing the commands, follows an advanced track,
// visits every desktop environment and login screen, the phone screen and the other pages.
// Set CHROMIUM=/path/to/chromium to use a browser you already have. Screenshots of failures go to screenshots/.

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };

// ---------- A tiny static server for the repo ----------
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const problems = [];
let step = '';

// Every page records uncaught errors and failed requests to this site. Outside requests (fonts, the API) are ignored.
const watch = (page) => {
  page.on('pageerror', (e) => problems.push(`[${step}] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !r.url().endsWith('/no-such-page')) problems.push(`[${step}] ${r.status()} ${r.url()}`); });
  return page;
};

const check = (ok, what) => { if (!ok) problems.push(`[${step}] ${what}`); };

async function section(name, fn, page) {
  step = name;
  page?.setDefaultTimeout(10000);
  process.stdout.write(`• ${name} … `);
  const before = problems.length;
  try {
    await fn();
  } catch (e) {
    problems.push(`[${name}] ${e.message.split('\n')[0]}`);
  }
  if (problems.length > before && page) {
    await mkdir(new URL('screenshots/', import.meta.url), { recursive: true });
    await page.screenshot({ path: fileURLToPath(new URL(`screenshots/${name.replace(/\W+/g, '-')}.png`, import.meta.url)) }).catch(() => {});
  }
  console.log(problems.length > before ? 'FAILED' : 'ok');
  return problems.length === before;
}

// ---------- The game, on a laptop ----------
const desk = await browser.newContext({ viewport: { width: 1366, height: 800 }, reducedMotion: 'reduce' });
await desk.addInitScript(() => { try { localStorage.setItem('tuxos-no-analytics', '1'); } catch { /* ignore */ } });
const page = watch(await desk.newPage());

// Types a command into the open terminal and waits for it to finish.
const run = async (command) => {
  const input = page.locator('.term-input').last();
  await input.fill(command);
  await input.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.term-line.busy'), null, { timeout: 15000 });
};
const closeAll = () => page.evaluate(() => [...OS.wm.windows].forEach((w) => w.close()));
const questDone = (id) => page.evaluate((q) => !!OS.state.quests.done[q], id);

const booted = await section('first boot: GRUB, boot log, play as a guest', async () => {
  await page.goto(BASE);
  await page.waitForSelector('#boot.grub');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#boot.bootlog');
  await page.keyboard.press('Space');
  await page.waitForSelector('#boot.login', { timeout: 15000 });
  await page.getByRole('button', { name: 'Play without an account' }).click();
  await page.locator('#boot input').first().fill('tester');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('boot').hidden && !document.getElementById('desktop').hidden);
}, page);

if (booted) {
await section('quests 1–7 in the terminal', async () => {
  await closeAll();
  await page.evaluate(() => OS.wm.open('terminal'));
  for (const c of ['whoami', 'pwd', 'ls', 'cat welcome.txt', 'cd dungeon', 'ls -a', 'cat .map', 'grep -r secret library',
    'chmod +x gate.sh', './gate.sh freedom', 'cd crypt', 'rm goblins/*', './stairs.sh',
    'sudo cat /root/crown.txt', 'mkdir ~/trophies', 'sudo cp /root/crown.txt ~/trophies/']) await run(c);
  for (const id of ['hello', 'letter', 'dungeon', 'library', 'gate', 'goblins', 'crown']) check(await questDone(id), `quest ${id} not complete`);
}, page);

await section('quest 8: Pipe Dream and a real pipe', async () => {
  await closeAll();
  await page.evaluate(() => OS.wm.open('pipedream'));
  const pick = (label) => page.locator('.pd-pick', { hasText: new RegExp(`^${label}$`) }).first().click();
  await pick('grep apple');
  await page.getByRole('button', { name: 'Next level →' }).click();
  await pick('sort');
  await page.getByRole('button', { name: 'Next level →' }).click();
  await pick('grep ERROR');
  await pick('wc -l');
  await closeAll();
  await page.evaluate(() => OS.wm.open('terminal'));
  await run('grep ERROR /var/log/syslog | wc -l');
  check(await questDone('pipes'), 'quest pipes not complete');
}, page);

await section('quests 9–10: packages and graduation', async () => {
  await run('sudo apt install cowsay');
  await run('cowsay Hello!');
  check(await questDone('packages'), 'quest packages not complete');
  await run('neofetch');
  await closeAll();
  await page.locator('.desk-icon', { hasText: 'Try Linux' }).dblclick();
  check(await questDone('graduate'), 'quest graduate not complete');
  await page.waitForFunction(() => OS.state.unlockedThemes.length === 4, null, { timeout: 3000 }).catch(() => check(false, 'not every desktop environment unlocked'));
}, page);

await section('advanced tracks', async () => {
  // A throwaway track, so this works whatever tracks js/tracks.js ships with.
  await page.evaluate(() => OS.tracks.list.push({ id: 'smoke', title: 'Smoke Test', blurb: 'Test track.', quests: [
    { id: 'one', title: 'One', story: 'Run date.', objectives: [{ text: 'Run date', hint: 'date', check: OS.quests.helpers.cmd('date') }] },
  ] }));
  await closeAll();
  await page.evaluate(() => OS.wm.open('journal', { tab: 'tracks' }));
  await page.locator('.track', { hasText: 'Smoke Test' }).getByRole('button', { name: 'Start track' }).click();
  check((await page.evaluate(() => OS.quests.describe())).includes('Smoke Test'), 'the quest command does not show the track');
  await closeAll();
  await page.evaluate(() => OS.wm.open('terminal'));
  check((await page.evaluate(() => OS.quests.hint())).includes('date'), 'hint does not come from the track');
  await run('date');
  check(await page.evaluate(() => !!OS.state.tracks.done['smoke/one']), 'track quest not complete');
}, page);

await section('every desktop environment and app', async () => {
  for (const de of ['gnome', 'retro', 'tiling', 'kde']) {
    await page.evaluate((id) => OS.applyTheme(id), de);
    await page.waitForTimeout(250);
    for (const app of await page.evaluate(() => OS.wm.appsInOrder())) {
      await page.evaluate((id) => OS.wm.open(id), app);
      await page.waitForTimeout(60);
    }
    check(await page.evaluate(() => document.body.dataset.theme), `desktop ${de} did not load`);
    await closeAll();
  }
}, page);

await section('every login screen', async () => {
  for (const greeter of ['sddm', 'gdm', 'dtlogin', 'tuigreet']) {
    for (const mode of ['create', 'username', 'guest']) {
      await page.evaluate(([g, m]) => OS.boot.login(m, {}, g), [greeter, mode]);
      check(await page.locator(`#boot.greeter-${greeter} input`).count() > 0, `${greeter} ${mode}: no input`);
    }
  }
}, page);

}

// ---------- A phone ----------
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const phone = watch(await phoneCtx.newPage());
await section('phone screen', async () => {
  await phone.goto(BASE);
  await phone.waitForSelector('.phone-menu');
  check(await phone.getByText('Read about Tuxplore').isVisible(), 'no About link on the phone screen');
  await phone.getByText('Boot anyway').click();
  await phone.waitForSelector('#boot.grub');
}, phone);

// ---------- The other pages ----------
const other = watch(await desk.newPage());
await section('about, stats and 404 pages', async () => {
  for (const path of ['about.html', 'stats.html', '404.html']) {
    await other.goto(BASE + path);
    check(await other.locator('h1').count() > 0, `${path} has no heading`);
  }
}, other);

await browser.close();
server.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\nAll good.');
