// Tuxplore save API: a Cloudflare Worker over a D1 database.
//
// Accounts are a username and a password, with no email and no reset: forget the password and the
// account is gone. The server stores each player's save (the game's OS.state JSON) without reading it.
//
//   POST /signup  {username, password, save?}  -> {token, username, updatedAt}
//   POST /login   {username, password}         -> {token, username, save, updatedAt}
//   GET  /save                                 -> {save, updatedAt}
//   PUT  /save    {save}                       -> {updatedAt}
//   POST /logout                               -> {}
// GET, PUT /save and /logout take "Authorization: Bearer <token>".

const USERNAME = /^[a-z_][a-z0-9_-]{0,15}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;
const MAX_SAVE_BYTES = 100 * 1024;
const PBKDF2_ITERATIONS = 100000; // the most Workers allows
const LIMITS = { signup: { max: 5, windowSec: 3600 }, login: { max: 10, windowSec: 300 } };

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
      console.error(err);
      return json({ error: 'Something went wrong on the server.' }, 500, cors);
    }
  },
};

async function route(request, env) {
  const { pathname } = new URL(request.url);
  const key = `${request.method} ${pathname}`;
  if (key === 'POST /signup') return signup(request, env);
  if (key === 'POST /login') return login(request, env);
  if (key === 'GET /save') return getSave(request, env);
  if (key === 'PUT /save') return putSave(request, env);
  if (key === 'POST /logout') return logout(request, env);
  if (key === 'GET /') return json({ ok: true, service: 'tuxplore-api' });
  throw new HttpError(404, 'Not found.');
}

// ---------- Handlers ----------

async function signup(request, env) {
  await rateLimit(env, 'signup', request);
  const { username, password, save } = await readJson(request);
  if (typeof username !== 'string' || !USERNAME.test(username) || username === 'root') {
    throw new HttpError(400, 'Use lowercase letters and numbers, starting with a letter (like "alex" or "sam_42").');
  }
  checkPassword(password);
  const saveText = save === undefined ? null : serializeSave(save);
  const now = Date.now();
  const hash = await hashPassword(password);
  const result = await env.DB.prepare(
    'INSERT INTO users (username, pass_hash, save, updated_at, created_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT (username) DO NOTHING',
  ).bind(username, hash, saveText, now).run();
  if (!result.meta.changes) throw new HttpError(409, 'That name is taken. Try another one.');
  const token = await createToken(env, username);
  return json({ token, username, updatedAt: now }, 201);
}

async function login(request, env) {
  await rateLimit(env, 'login', request);
  const { username, password } = await readJson(request);
  if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Enter a username and password.');
  const user = await env.DB.prepare('SELECT pass_hash, save, updated_at FROM users WHERE username = ?1').bind(username).first();
  if (!user) throw new HttpError(404, 'No account with that name.');
  if (!(await verifyPassword(password, user.pass_hash))) throw new HttpError(401, 'Wrong password.');
  const token = await createToken(env, username);
  return json({ token, username, save: user.save ? JSON.parse(user.save) : null, updatedAt: user.updated_at });
}

async function getSave(request, env) {
  const username = await authenticate(request, env);
  const row = await env.DB.prepare('SELECT save, updated_at FROM users WHERE username = ?1').bind(username).first();
  return json({ save: row?.save ? JSON.parse(row.save) : null, updatedAt: row?.updated_at ?? null });
}

// Last write wins: two devices playing at the same moment is rare enough to ignore.
async function putSave(request, env) {
  const username = await authenticate(request, env);
  const { save } = await readJson(request);
  const text = serializeSave(save);
  const now = Date.now();
  await env.DB.prepare('UPDATE users SET save = ?1, updated_at = ?2 WHERE username = ?3').bind(text, now, username).run();
  return json({ updatedAt: now });
}

async function logout(request, env) {
  const token = bearer(request);
  if (token) await env.DB.prepare('DELETE FROM tokens WHERE token_hash = ?1').bind(await sha256(token)).run();
  return json({});
}

// ---------- Passwords and tokens ----------

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new HttpError(400, `Use a password of at least ${MIN_PASSWORD} characters. There's no reset, so pick one you'll remember.`);
  }
  if (password.length > MAX_PASSWORD) throw new HttpError(400, 'That password is too long.');
}

// Stored as pbkdf2$<iterations>$<salt>$<hash>, so the iteration count can change later.
async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  const [, iterations, salt] = stored.split('$');
  const candidate = await hashPassword(password, unb64(salt), Number(iterations));
  return timingSafeEqual(candidate, stored);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The browser keeps the token; the database only keeps its hash, so a leaked table can't log anyone in.
async function createToken(env, username) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO tokens (token_hash, username, created_at) VALUES (?1, ?2, ?3)')
    .bind(await sha256(token), username, Date.now()).run();
  return token;
}

async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) throw new HttpError(401, 'Log in first.');
  const row = await env.DB.prepare('SELECT username FROM tokens WHERE token_hash = ?1').bind(await sha256(token)).first();
  if (!row) throw new HttpError(401, 'Your login has expired. Log in again.');
  return row.username;
}

function bearer(request) {
  const m = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '');
  return m ? m[1] : null;
}

// ---------- Rate limiting: a fixed window per IP and action ----------

async function rateLimit(env, action, request) {
  const { max, windowSec } = LIMITS[action];
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const windowStart = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  const key = `${action}:${ip}:${windowStart}`;
  const row = await env.DB.prepare(
    'INSERT INTO attempts (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count',
  ).bind(key, (windowStart + windowSec) * 1000).first();
  if (row.count > max) throw new HttpError(429, 'Too many tries. Wait a few minutes and try again.');
  // Tidy old windows now and then.
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM attempts WHERE expires_at < ?1').bind(Date.now()).run();
}

// ---------- Helpers ----------

function serializeSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) throw new HttpError(400, 'The save must be a JSON object.');
  const text = JSON.stringify(save);
  if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES) throw new HttpError(413, 'That save is too big.');
  return text;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Send a JSON body.');
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
