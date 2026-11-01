import type { IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import { openBrowser } from './cdp.ts';
import { freePort } from './site.ts';

const run = promisify(execFile);
const dir = new URL('routes/', import.meta.url).pathname;
const USER = { UUID: 'u1', email: 'ada@example.com', roles: [] };
const servers: ChildProcess[] = [];
let api: Awaited<ReturnType<typeof startAPI>>;
let env: NodeJS.ProcessEnv;
let site: string;

/**
 * A stand-in ohne API under `/api` that keeps every request it gets in `requests`.
 * Signing in with the password `secret` sets the session cookie, and signing out clears it.
 */
async function startAPI() {
  const requests: { path: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://api');
    requests.push({ path: url.pathname + url.search, headers: request.headers });
    const json = (status: number, value: unknown, headers: Record<string, string> = {}) => {
      const type = { 'content-type': 'application/json', ...headers };
      response.writeHead(status, type).end(JSON.stringify(value));
    };
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      let text = '';
      request.on('data', (chunk) => (text += chunk));
      return request.on('end', () => {
        if (JSON.parse(text).password !== 'secret') return json(401, { message: 'Invalid' });
        json(200, USER, { 'set-cookie': 'session=s1; Path=/; HttpOnly; SameSite=Lax' });
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      return json(200, { ok: true }, { 'set-cookie': 'session=; Max-Age=0; Path=/' });
    }
    if (url.pathname === '/api/auth/me') {
      if (request.headers.cookie?.includes('session=s1')) return json(200, USER);
      return response.writeHead(204).end();
    }
    if (url.pathname === '/api/sites')
      return json(200, [{ code: 'a', name: `Acme ${url.search}` }]);
    json(404, { message: 'Not found' });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, requests, close: () => server.close() };
}

/**
 * Serves the app, built or under `nuxt dev`, with `NUXT_OHNE_API` set to `address` and `extra` env vars.
 * It answers the site's origin once the site answers, and rejects with the server's stderr if it exits first.
 */
async function serve(address: string, { dev = false, extra = {} as Record<string, string> } = {}) {
  const port = await freePort();
  const [command, args] = dev
    ? ['node_modules/.bin/nuxt', ['dev', '--port', String(port), '--host', '127.0.0.1']]
    : ['node', ['.output/server/index.mjs']];
  const server = spawn(command, args, {
    cwd: dir,
    env: { ...env, PORT: String(port), HOST: '127.0.0.1', NUXT_OHNE_API: address, ...extra },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  servers.push(server);
  let stderr = '';
  server.stderr!.on('data', (chunk) => (stderr += chunk));
  const origin = `http://127.0.0.1:${port}`;
  while (!(await fetch(origin).catch(() => undefined))) {
    if (server.exitCode !== null) throw new Error(stderr);
    await sleep(200);
  }
  return origin;
}

before(async () => {
  api = await startAPI();
  env = { ...process.env };
  delete env.NUXT_OHNE_API;
  rmSync(`${dir}.output`, { recursive: true, force: true });
  // Vite keeps its bundle of `@ohnejs/client` until the lockfile changes, so a linked client goes stale.
  rmSync(`${dir}node_modules/.cache/vite`, { recursive: true, force: true });
  await run('pnpm', ['exec', 'nuxt', 'build'], { cwd: dir, env });
  site = await serve(`${api.origin}/api`);
});

after(() => {
  for (const server of servers) server.kill();
  api?.close();
});

test("with `cms: false`, the server calls the API with the visitor's cookie and language only", async () => {
  api.requests.length = 0;
  const html = await fetch(site, {
    headers: { cookie: 'session=s1; other=1', 'accept-language': 'de', authorization: 'Bearer x' },
  }).then((response) => response.text());
  assert.match(html, /<p class="user">ada@example\.com<\/p>/);
  assert.match(html, /<p class="site">Acme \?client=acme<\/p>/);
  const paths = api.requests.map(({ path }) => path).sort();
  assert.deepEqual(paths, ['/api/auth/me', '/api/sites?client=acme']);
  for (const { headers } of api.requests) {
    assert.equal(headers.cookie, 'session=s1; other=1');
    assert.equal(headers['accept-language'], 'de');
    assert.equal(headers.authorization, undefined);
  }
});

test('with `cms: false`, the site serves no cms route, and its error pages keep their framing', async () => {
  api.requests.length = 0;
  for (const path of ['/sitemap.xml', '/robots.txt', '/_ohne/cms/routes/resolve?path=/']) {
    const response = await fetch(`${site}${path}`, { headers: { accept: 'text/html' } });
    await response.body?.cancel();
    assert.deepEqual([response.status, response.headers.get('x-frame-options')], [404, 'DENY']);
  }
  assert.deepEqual(api.requests, []);
});

test('with `cms: false`, an API address without the path the browser calls fails the page', async () => {
  const moved = await serve(api.origin);
  api.requests.length = 0;
  const response = await fetch(moved);
  await response.body?.cancel();
  assert.equal(response.status, 500);
  assert.deepEqual(api.requests, []);
});

test('with `cms: false` and `sandbox`, every page is unindexed, and a bound one private', async () => {
  const sandboxed = await serve(`${api.origin}/api`, {
    extra: { NUXT_OHNE_SANDBOX: 'ohne_sandbox' },
  });
  const cases: [string, string | null][] = [
    ['ohne_sandbox=a1', 'private, no-store'],
    ['session=s1', null],
  ];
  for (const [cookie, cache] of cases) {
    const response = await fetch(sandboxed, { headers: { cookie } });
    await response.body?.cancel();
    assert.equal(response.headers.get('x-robots-tag'), 'noindex', cookie);
    assert.equal(response.headers.get('cache-control'), cache, cookie);
  }
});

test('with `cms: false` and `sandbox`, a cached route rule refuses to start', async () => {
  const extra = {
    NUXT_OHNE_SANDBOX: 'ohne_sandbox',
    NUXT_NITRO_ROUTE_RULES: JSON.stringify({ '/**': { swr: 60 } }),
  };
  await assert.rejects(
    serve(`${api.origin}/api`, { extra }),
    /a cached route would share: `\/\*\*`\./,
  );
});

test(
  'with `cms: false`, `nuxt dev` serves the API on the site, so a sign-in and a sign-out in the browser hold',
  { timeout: 120_000 },
  async () => {
    const dev = await serve(`${api.origin}/api`, { dev: true });
    const browser = await openBrowser();
    try {
      await browser.goto(dev);
      const ready = `window.nuxtApp && !nuxtApp.isHydrating`;
      await browser.until(
        `${ready} && document.querySelector('.user')?.textContent === 'signed out'`,
        undefined,
        60_000,
      );
      api.requests.length = 0;
      await browser.evaluate(`document.querySelector('.in').click()`);
      await browser.until(`document.querySelector('.user').textContent === 'ada@example.com'`);
      const login = api.requests.find(({ path }) => path === '/api/auth/login');
      assert.equal(login?.headers['sec-fetch-site'], 'same-origin');
      api.requests.length = 0;
      await browser.goto(dev);
      await browser.until(
        `${ready} && document.querySelector('.user')?.textContent === 'ada@example.com'`,
      );
      const me = api.requests.filter(({ path }) => path === '/api/auth/me');
      assert.equal(me.length, 1);
      assert.equal(me[0]!.headers.cookie, 'session=s1');
      assert.equal(me[0]!.headers['sec-fetch-site'], undefined);
      await browser.evaluate(`document.querySelector('.out').click()`);
      await browser.until(`document.querySelector('.user').textContent === 'signed out'`);
    } finally {
      await browser.close();
    }
  },
);
