# Tuxplore save API

A Cloudflare Worker with a D1 (SQLite) database that stores each player's progress. Accounts are a
username and a password, with no email and no password reset: forget the password and the account is gone.

| Endpoint | Body | Returns |
|---|---|---|
| `POST /signup` | `{username, password, save?}` | `{token, username, updatedAt}`, or 409 if the name is taken |
| `POST /login` | `{username, password}` | `{token, username, save, updatedAt}`, or 404 / 401 |
| `GET /save` | | `{save, updatedAt}` |
| `PUT /save` | `{save}` | `{updatedAt}` |
| `POST /logout` | | `{}` |

`/save` and `/logout` need `Authorization: Bearer <token>`. Passwords are hashed with PBKDF2, only a hash
of each token is stored, saves are capped at 100 KB, and sign-ups and logins are rate-limited per IP.

## Run it locally

```bash
cd api
npm install
npm run db:init:local     # create the tables in a local database
npm run dev               # http://localhost:8787
```

## Deploy

```bash
npx wrangler login                    # opens the browser to sign in to Cloudflare
npx wrangler d1 create tuxplore       # prints a database_id: paste it into wrangler.jsonc
npm run db:init:remote                # create the tables in the real database
npm run deploy                        # prints the URL, e.g. https://tuxplore-api.<you>.workers.dev
```

To serve it from your own domain instead, add a route to `wrangler.jsonc` (the domain must use Cloudflare DNS):

```jsonc
"routes": [{ "pattern": "api.tuxplore.akashanil.dev", "custom_domain": true }]
```

Sites allowed to call the API are listed in `ALLOWED_ORIGINS` in `wrangler.jsonc`.
