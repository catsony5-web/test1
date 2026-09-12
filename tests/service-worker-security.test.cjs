const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function worker() {
  const events = {}, puts = [], deleted = [], pending = [], opened = [];
  const cacheEntries = new Map();
  const cacheKey = (request) => new URL(typeof request === 'string' ? request : request.url, 'https://budget.test/service-worker.js').href;
  const ctx = vm.createContext({ URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout, fetch: async () => new Response('asset'),
    self: { location: new URL('https://budget.test/service-worker.js'),
      addEventListener: (name, fn) => { events[name] = fn; }, clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches: { open: async (name) => {
      opened.push(name);
      return {
        put: async (key, response) => {
          puts.push(key);
          cacheEntries.set(cacheKey(key), response.clone());
        },
        addAll: async (entries) => {
          for (const entry of entries) cacheEntries.set(cacheKey(entry), new Response(`precache:${cacheKey(entry)}`));
        },
        match: async (request, options = {}) => {
          const key = cacheKey(request);
          const response = options.ignoreSearch
            ? [...cacheEntries].find(([url]) => new URL(url).pathname === new URL(key).pathname)?.[1]
            : cacheEntries.get(key);
          return response?.clone();
        }
      };
    }, match: async () => { throw new Error('Cross-cache reads are not allowed'); },
      keys: async () => ['monthly-card-budget-old', 'another-app-private'], delete: async (key) => deleted.push(key) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8'), ctx);
  function request(url, options = {}) {
    let response;
    events.fetch({ request: new Request(url, options), respondWith: (value) => { response = value; }, waitUntil: (value) => pending.push(value) });
    return response;
  }
  async function install() {
    let done;
    events.install({ waitUntil: (value) => { done = value; } });
    await done;
  }
  return { ctx, events, puts, deleted, pending, opened, request, install };
}

test('worker does not intercept financial API, third-party or authenticated requests', () => {
  const { request } = worker();
  for (const url of ['https://budget.test/api/accounts', 'https://budget.test/backup.json', 'https://other.test/index.html']) {
    assert.equal(request(url), undefined);
  }
  assert.equal(request('https://budget.test/index.html', { headers: { Authorization: 'Bearer test' } }), undefined);
  assert.equal(request('https://budget.test/index.html', { method: 'POST' }), undefined);
});

test('public assets can be cached; private/no-store responses cannot', async () => {
  const workerState = worker();
  await workerState.request('https://budget.test/index.html');
  await Promise.all(workerState.pending);
  assert.equal(workerState.puts.length, 1);
  for (const directive of ['no-store', 'private, max-age=0']) {
    workerState.ctx.fetch = async () => new Response('private', { headers: { 'Cache-Control': directive } });
    await workerState.request('https://budget.test/app-icon.svg');
    await workerState.request('https://budget.test/data/ipo-calendar.json');
  }
  assert.equal(workerState.puts.length, 1);
});

test('activation only removes obsolete caches owned by this application', async () => {
  const { events, deleted } = worker();
  let done;
  events.activate({ waitUntil: (value) => { done = value; } });
  await done;
  assert.deepEqual(deleted, ['monthly-card-budget-old']);
});

test('public schedule timeout aborts the request and identifies the last cached schedule', async () => {
  const { ctx, request } = worker();
  const schedule = JSON.stringify({ items: [{ sourceId: 'test-1', company: 'Synthetic public company' }] });
  ctx.fetch = async () => new Response(schedule);
  assert.equal(await (await request('https://budget.test/data/ipo-calendar.json')).text(), schedule);
  let expire, cleared = false, signal;
  ctx.setTimeout = (callback, ms) => { assert.equal(ms, 10000); expire = callback; return 1; };
  ctx.clearTimeout = () => { cleared = true; };
  ctx.fetch = (req) => new Promise((resolve, reject) => {
    signal = req.signal;
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  });
  const responsePromise = request('https://budget.test/data/ipo-calendar.json');
  expire();
  const response = await responsePromise;
  assert.equal(signal.aborted, true);
  assert.equal(cleared, true);
  assert.equal(response.headers.get('X-Budget-Schedule-Cache'), 'offline');
  assert.equal(await response.text(), schedule);
});

test('HTTP and malformed schedule failures preserve the last valid cached payload', async () => {
  const { ctx, request } = worker();
  const schedule = JSON.stringify({ items: [{ sourceId: 'test-1', company: 'Synthetic public company' }] });
  ctx.fetch = async () => new Response(schedule);
  await request('https://budget.test/data/ipo-calendar.json');
  for (const makeResponse of [
    () => new Response('unavailable', { status: 503 }), () => new Response('{broken'),
    () => Response.json({ error: 'upstream' }), () => Response.json({ items: [null] }),
    () => Response.json({ items: [{ sourceId: { toString: null }, company: 'Synthetic' }] })
  ]) {
    ctx.fetch = async () => makeResponse();
    const response = await request('https://budget.test/data/ipo-calendar.json');
    assert.equal(response.headers.get('X-Budget-Schedule-Cache'), 'offline');
    assert.equal(await response.text(), schedule);
  }
});

test('installation validates the public feed instead of precaching malformed schedule items', async () => {
  const { ctx, install, puts } = worker();
  ctx.fetch = async () => Response.json({ items: [null] });
  await install();
  assert.equal(puts.length, 0, 'A bad public feed must not enter the app cache');
});

test('asset and offline fallbacks only read this version of the application cache', async () => {
  const { ctx, request, opened } = worker();
  ctx.fetch = async () => { throw new Error('Offline'); };
  for (const url of [
    'https://budget.test/src/data/constants.js?v=offline',
    'https://budget.test/index.html',
    'https://budget.test/data/ipo-calendar.json'
  ]) {
    const response = await request(url);
    assert.equal(response.type, 'error');
  }
  const cacheName = vm.runInContext('CACHE_NAME', ctx);
  assert.ok(opened.length > 0);
  assert.ok(opened.every((name) => name === cacheName));
});

test('install precaches every exact HTML asset URL for immediate offline startup', async () => {
  const { ctx, request, install } = worker();
  await install();
  let networkRequests = 0;
  ctx.fetch = async () => { networkRequests += 1; throw new Error('Offline'); };
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const references = [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)]
    .map(([tag]) => tag.match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1])
    .filter(Boolean);
  assert.ok(references.length > 0);
  for (const reference of references) {
    const url = new URL(reference, 'https://budget.test/index.html').href;
    const response = await request(url);
    assert.equal(await response.text(), `precache:${url}`, reference);
  }
  assert.equal(networkRequests, 0, 'Startup assets must not wait for failed network requests');
});

test('a new asset query fetches its own version and cannot fall back to an older cached query', async () => {
  const { ctx, request, install, pending } = worker();
  await install();
  let networkRequests = 0;
  ctx.fetch = async () => { networkRequests += 1; return new Response('next release'); };
  const next = await request('https://budget.test/src/data/constants.js?v=next-release');
  assert.equal(await next.text(), 'next release');
  assert.equal(networkRequests, 1);
  await Promise.all(pending);
  ctx.fetch = async () => { networkRequests += 1; throw new Error('Offline'); };
  const missing = await request('https://budget.test/src/data/constants.js?v=unavailable-release');
  assert.equal(missing.type, 'error', 'A different cached version must not be substituted');
  const bare = await request('https://budget.test/src/data/constants.js');
  assert.match(await bare.text(), /^precache:https:\/\/budget\.test\/src\/data\/constants\.js\?v=/);
});
