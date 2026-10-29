// Realm Fall status + start Worker.
// Secrets (set with `npx wrangler secret put FALIX_API_KEY`) never appear in the page or the repo.
// Vars (wrangler.toml): FALIX_API_BASE, SERVER_ID, ALLOWED_ORIGIN

const STATUS_TTL = 15;      // seconds: shared status cache, protects the API rate limit
const START_COOLDOWN = 120; // seconds between start requests (per Cloudflare location)

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });

async function falix(env, path, init = {}) {
  if (!env.FALIX_API_KEY) return { ok: false, status: 0, body: null, why: 'missing_key' };
  let res;
  try {
  res = await fetch(env.FALIX_API_BASE.replace(/\/$/, '') + path, {
    ...init,
    headers: {
      authorization: 'Bearer ' + env.FALIX_API_KEY,
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  } catch (e) { return { ok: false, status: 0, body: null, why: 'network' }; }
  let body = null;
  try { body = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, body };
}

const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

async function readStatus(env, ctx, request) {
  const cache = caches.default;
  const key = new Request(new URL('/__cache/status', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const s = await falix(env, `/servers/${env.SERVER_ID}/status`);
  let state = 'unknown';
  if (s.ok) {
    const d = pick(s.body, 'data') || s.body || {};
    state = String(pick(d, 'state') || pick(d.live_status || {}, 'state') || 'unknown').toLowerCase();
  } else {
    state = 'unavailable';
    var dbg = { upstream_status: s.status, why: s.why || null };
  }

  let players = null, max = null;
  if (state === 'running' || state === 'online') {
    const p = await falix(env, `/servers/${env.SERVER_ID}/players/online`);
    if (p.ok) {
      const d = pick(p.body, 'data') || p.body || {};
      players = pick(d, 'online', 'count', 'online_players', 'players_online');
      if (Array.isArray(players)) players = players.length;
      max = pick(d, 'max', 'max_players');
    }
  }

  const out = { state, debug: dbg || undefined, players: typeof players === 'number' ? players : null, max: typeof max === 'number' ? max : null };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${STATUS_TTL}` },
  })));
  return out;
}

async function handleStart(request, env, ctx) {
  // Same-site requests only.
  const origin = request.headers.get('origin');
  if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'forbidden' }, 403);

  const cache = caches.default;
  const lockKey = new Request(new URL('/__cache/start-lock', request.url).toString());
  if (await cache.match(lockKey)) {
    return json({ result: 'cooldown', message: 'A start was just requested. Give it a minute.' }, 429);
  }

  const st = await readStatus(env, ctx, request);
  if (st.state === 'running' || st.state === 'online' || st.state === 'starting') {
    return json({ result: 'already', state: st.state });
  }

  // Lock first so a burst of clicks makes at most one API call.
  await cache.put(lockKey, new Response('1', { headers: { 'cache-control': `max-age=${START_COOLDOWN}` } }));

  const r = await falix(env, `/servers/${env.SERVER_ID}/power`, {
    method: 'POST',
    body: JSON.stringify({ signal: 'start' }),
  });

  if (r.status === 202 || r.ok) return json({ result: 'started' });

  const code = pick(r.body && r.body.error, 'code');
  if (code === 'verification_required') {
    // Free plan: Falix wants its own check before a start.
    return json({
      result: 'verification_required',
      action_url: pick(r.body.error, 'action_url') || 'https://falixnodes.net/startserver',
    });
  }
  await cache.delete(lockKey); // failed, let them retry
  return json({ result: 'error', message: 'Could not start the server right now.',
    debug: { upstream_status: r.status, why: r.why || null, code: code || null } }, 502);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/status' && request.method === 'GET') {
        return json(await readStatus(env, ctx, request));
      }
      if (url.pathname === '/api/start' && request.method === 'POST') {
        return await handleStart(request, env, ctx);
      }
    } catch (e) {
      return json({ error: 'server_error' }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
