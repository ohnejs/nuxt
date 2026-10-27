import { createOhne } from '@ohnejs/client';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import type { CMS } from './fixture/ohne.ts';

import { page, startAPI } from './api.ts';
import { openBrowser } from './cdp.ts';

const run = promisify(execFile);
const PREVIEW = new URL('../node_modules/@ohnejs/cms/preview/browser.js', import.meta.url);
const SANDBOX = 'ohne_sandbox';
const POST = '00000000-0000-4000-8000-000000000001';

/**
 * A port on `127.0.0.1` that nothing listens on.
 */
export async function freePort() {
  const probe = createNetServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as AddressInfo;
  probe.close();
  return port;
}

/**
 * Builds the Nuxt app in `tests/<app>/` and serves it against a stand-in API.
 * It then runs every server and browser test.
 * The app's config names a dead API, so each passing test also proves that `NUXT_OHNE_API` replaces it.
 */
export function suite(app: string) {
  const dir = new URL(`${app}/`, import.meta.url).pathname;
  let api: Awaited<ReturnType<typeof startAPI>>;
  let env: NodeJS.ProcessEnv;
  let site: Awaited<ReturnType<typeof serve>>;
  let sandboxed: Awaited<ReturnType<typeof serve>>;
  let origin: string;
  let dashboard: Server;
  let editor: string;
  let browser: Awaited<ReturnType<typeof openBrowser>>;

  /**
   * Starts the built server against the stand-in API, with `extra` in its environment.
   * It answers once the server listens, or rejects with what it printed when it exits first.
   */
  async function serve(extra: Record<string, string> = {}) {
    // Nitro reads `PORT=0` as unset and takes its default, so the free port is found here.
    const port = await freePort();
    const at = `http://127.0.0.1:${port}`;
    const server = spawn('node', ['.output/server/index.mjs'], {
      cwd: dir,
      env: { ...env, PORT: String(port), HOST: '127.0.0.1', NUXT_OHNE_API: api.origin, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    server.stderr!.on('data', (chunk) => (stderr += chunk));
    const exit = once(server, 'exit');
    await Promise.race([
      new Promise((resolve) =>
        server.stdout!.on('data', (chunk) => String(chunk).includes(at) && resolve(0)),
      ),
      exit.then(([code]) => Promise.reject(Object.assign(new Error(stderr), { code }))),
    ]);
    return { origin: at, stderr: () => stderr, kill: () => server.kill() };
  }

  before(async () => {
    dashboard = createServer((request, response) => {
      const html = request.url?.startsWith('/demo')
        ? demo(request.url.includes('named'))
        : `<!doctype html>
<iframe src="${origin}/about?tags=[a%2Cb]&ohne-preview=tok" width="800" height="600"></iframe>
<script>
  window.received = [];
  addEventListener('message', (event) => event.data?.ohne === 1 && received.push(event.data.type));
  window.send = (page) => frames[0].postMessage({ ohne: 1, type: 'data', page }, '${origin}');
</script>`;
      response.writeHead(200, { 'content-type': 'text/html' }).end(html);
    });
    dashboard.listen(0, '127.0.0.1');
    await once(dashboard, 'listening');
    editor = `http://localhost:${(dashboard.address() as AddressInfo).port}`;
    api = await startAPI(
      readFileSync(PREVIEW, 'utf8').replace("'__OHNE_DASHBOARD_ORIGIN__'", JSON.stringify(editor)),
    );

    // Nitro's traced `node_modules` can hold symlink cycles that its next build cannot clear.
    rmSync(`${dir}.output`, { recursive: true, force: true });
    env = { ...process.env };
    delete env.NUXT_OHNE_API;
    delete env.NUXT_OHNE_SANDBOX;
    await run('pnpm', ['exec', 'nuxt', 'build'], { cwd: dir, env });
    site = await serve();
    origin = site.origin;
    sandboxed = await serve({ NUXT_OHNE_SANDBOX: SANDBOX });
    browser = await openBrowser();
  });

  after(async () => {
    await browser?.close();
    site?.kill();
    sandboxed?.kill();
    dashboard?.close();
    api?.close();
  });

  /**
   * A demo page on another origin that frames the sandboxed site, named as a demo names it when `named`.
   * It answers `hello` with `theme`, and `shown()` tells the frame it shows again.
   */
  function demo(named: boolean) {
    return `<!doctype html>
<iframe ${named ? 'name="ohne-sandbox"' : ''} src="${sandboxed.origin}/about" width="800" height="600"></iframe>
<script>
  window.received = [];
  const envelope = { ohne: 'embed', v: 1 };
  addEventListener('message', (event) => {
    if (event.data?.ohne !== 'embed') return;
    received.push(event.data.type);
    if (event.data.type === 'hello') {
      frames[0].postMessage({ ...envelope, type: 'theme', scheme: 'light' }, event.origin);
    }
  });
  window.shown = () => frames[0].postMessage({ ...envelope, type: 'shown' }, '${sandboxed.origin}');
</script>`;
  }

  /**
   * The status a request for `path` gets, sent as is, so no client resolves its dot segments first.
   */
  async function raw(path: string, method = 'GET') {
    const { hostname, port } = new URL(origin);
    const request = httpRequest({ hostname, port, path, method });
    request.end();
    const [response] = await once(request, 'response');
    response.resume();
    return response.statusCode as number;
  }

  async function get(path: string, init?: RequestInit) {
    api.hits.length = 0;
    const response = await fetch(`${origin}${path}`, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
      ...init,
    });
    return { response, html: await response.text(), hits: api.hits.map((hit) => hit.path) };
  }

  /**
   * Each tag `renderHead` writes for `resolved`, as the server must render it.
   */
  function headTags(resolved: ReturnType<typeof page>, token?: string) {
    return createOhne({ api: api.origin })
      .renderHead(resolved, { token })
      .split(/(?<=>)(?=<)/);
  }

  test('a page renders on the server with one resolve for layout and page', async () => {
    const { response, html, hits } = await get('/about?ref=x#top');
    assert.equal(response.status, 200);
    assert.deepEqual(hits, ['/about?ref=x']);
    assert.match(html, /layout:en:\/about/);
    assert.match(html, /<h1>about<\/h1>/);
    assert.match(html, /<section class="hero" data-ohne-block="page:\/about-hero">/);
    assert.match(html, /<div class="text" data-ohne-block="page:\/about-text">/);
    assert.doesNotMatch(html, /data-ohne-block="page:\/about-unknown"|<blocksunknown/i);
    assert.doesNotMatch(html, /href="javascript:/);
  });

  test('the head carries every tag `renderHead` writes, and the language', async () => {
    const { html } = await get('/de/ueber');
    assert.match(html, /<html[^>]* lang="de"/);
    for (const tag of headTags(page('/de/ueber', 'Ueber', 'de')))
      assert.ok(html.includes(tag), tag);
    assert.doesNotMatch(html, /name="robots"/);
  });

  test('a redirect answers its own code and keeps the query, resolving once', async () => {
    const { response, hits } = await get('/old?ref=x');
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), '/about?ref=x');
    assert.deepEqual(hits, ['/old?ref=x']);
    const away = await get('/away');
    assert.equal(away.response.status, 302);
    assert.equal(away.response.headers.get('location'), 'https://example.com/x');
  });

  test('a miss renders the `404` record with a `404` status', async () => {
    const { response, html } = await get('/missing');
    assert.equal(response.status, 404);
    assert.match(html, /<h1>Lost: Lost<\/h1>/);
    assert.match(html, /layout:notFound/);
  });

  test('a miss without a `404` record is a `404` error, resolving once', async () => {
    const { response, html, hits } = await get('/gone');
    assert.equal(response.status, 404);
    assert.equal(response.statusText, 'Page Not Found');
    assert.match(html, /error:404/);
    assert.match(html, /<p class="message">Page Not Found<\/p>/);
    assert.match(html, /layout:notFound/);
    assert.deepEqual(hits, ['/gone']);
  });

  test('a preview of a miss without a `404` record stays private and keeps its token', async () => {
    const { response, html, hits } = await get('/gone?ohne-preview=tok');
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.deepEqual(hits, ['/gone?ohne-preview=tok']);
    assert.equal(api.hits[0]?.token, 'tok');
  });

  test('a miss carrying `seo` and `locale` fills the head from them', async () => {
    const { response, html } = await get('/vermisst');
    assert.equal(response.status, 404);
    assert.match(html, /<title>Vermisst \| Site<\/title>/);
    assert.match(html, /<html[^>]* lang="de"/);
    assert.doesNotMatch(html, /rel="canonical"/);
  });

  test('an API failure is a `502` error, never an empty page, resolving once', async () => {
    const { response, html, hits } = await get('/boom');
    assert.equal(response.status, 502);
    assert.match(html, /error:502/);
    assert.deepEqual(hits, ['/boom']);
  });

  test('a page outside the cms resolves nothing, and links render by their address', async () => {
    const { response, html, hits } = await get('/contact');
    assert.equal(response.status, 200);
    assert.deepEqual(hits, []);
    assert.match(html, /layout:none/);
    assert.match(html, /<a href="\/about" class="about">about<\/a>/);
    assert.match(
      html,
      /<a href="\/de\/ueber" rel="noopener noreferrer" target="_blank">ueber<\/a>/,
    );
    assert.match(html, /<span class="cta">unsafe<\/span>/);
    assert.match(html, /<span>unpublished<\/span>/);
  });

  test('a preview is private, asks search engines to stay away, and passes its token', async () => {
    const { response, html, hits } = await get('/about?ohne-preview=tok');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    for (const tag of headTags(page('/about', 'about preview tok'), 'tok'))
      assert.ok(html.includes(tag), tag);
    assert.deepEqual(hits, ['/about?ohne-preview=tok']);
    assert.equal(api.hits[0]?.token, 'tok');
  });

  test('the site relays the sitemap, robots.txt and the browser routes, and nothing else', async () => {
    assert.equal((await get('/sitemap.xml')).html, '<urlset/>');
    assert.equal((await get('/robots.txt')).html, 'User-agent: *');
    const resolved = await get('/_ohne/cms/routes/resolve?path=%2Fabout', {
      headers: { 'ohne-preview': 't' },
    });
    assert.equal(JSON.parse(resolved.html).record.title, 'about preview t');
    assert.equal(resolved.response.headers.get('cache-control'), 'private, no-store');
    assert.equal(resolved.response.headers.get('x-robots-tag'), 'noindex');
    const script = await get('/_ohne/cms/preview.js?auto');
    assert.equal(script.response.headers.get('content-type'), 'text/javascript');
    assert.match(script.html, /export function connect/);
    assert.equal((await get('/_ohne/collections/users/query')).response.status, 404);
    assert.equal((await get('/_ohne//evil.test/cms/robots.txt')).response.status, 404);
  });

  test('the relay refuses a write and answers a head request', async () => {
    const post = await get('/_ohne/cms/routes/resolve?path=%2F', { method: 'POST' });
    assert.equal(post.response.status, 405);
    assert.equal(post.response.headers.get('allow'), 'GET, HEAD');
    const head = await fetch(`${origin}/robots.txt`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'text/plain');
  });

  const titles = (html: string, selector: string) =>
    [...html.matchAll(new RegExp(`<p class="${selector}">([^<]*)</p>`, 'g'))].map(
      (match) => match[1],
    );

  test('a layout reads the settings in the page locale, and a page lists records', async () => {
    const about = await get('/about');
    assert.match(
      about.html.replaceAll(/<!--.*?-->/g, ''),
      /<nav class="menu"><a href="\/"[^>]*>\s*Home\s*<\/a><a href="\/posts"[^>]*>\s*Posts\s*<\/a><\/nav>/,
    );
    assert.match(about.html, /<footer class="copyright">© en<\/footer>/);
    assert.match((await get('/de/ueber')).html, /<footer class="copyright">© de<\/footer>/);
    assert.match((await get('/contact')).html, /<footer class="copyright">© default<\/footer>/);
    api.requests.length = 0;
    const posts = await get('/posts?page=2');
    assert.deepEqual(titles(posts.html, 'post'), ['Post 3', 'Post 2']);
    assert.match(posts.html, /<p class="pager">2\/3<\/p>/);
    assert.ok(
      api.requests.some(
        ({ path }) =>
          decodeURIComponent(path) ===
          '/cms/records/Posts?order=[-publishedAt]&select=[title]&page=2&perPage=2',
      ),
      JSON.stringify(api.requests.map(({ path }) => path)),
    );
  });

  test('a record reads by its `UUID`, and a miss reads `undefined`', async () => {
    assert.deepEqual(titles((await get(`/post?id=${POST}`)).html, 'title'), ['Post 1']);
    const other = '00000000-0000-4000-8000-000000000009';
    assert.deepEqual(titles((await get(`/post?id=${other}`)).html, 'title'), ['none']);
    assert.deepEqual(titles((await get('/post?id=..')).html, 'title'), ['none']);
  });

  test('the relay forwards a records read with its query, by name and `UUID`', async () => {
    api.requests.length = 0;
    const list = await get('/_ohne/cms/records/Posts?page=2&perPage=2');
    assert.equal(list.response.status, 200);
    assert.deepEqual(
      JSON.parse(list.html).records.map(({ title }: { title: string }) => title),
      ['Post 3', 'Post 4'],
    );
    assert.equal(list.response.headers.get('set-cookie'), null);
    assert.equal(JSON.parse((await get(`/_ohne/cms/records/Posts/${POST}`)).html).title, 'Post 1');
    assert.equal(
      (await get('/_ohne/cms/records/Posts/00000000-0000-4000-8000-000000000009')).response.status,
      404,
    );
    assert.deepEqual(
      api.requests.map(({ path }) => path),
      [
        '/cms/records/Posts?page=2&perPage=2',
        `/cms/records/Posts/${POST}`,
        '/cms/records/Posts/00000000-0000-4000-8000-000000000009',
      ],
    );
  });

  test('the relay refuses every other records path, and never asks the API', async () => {
    api.requests.length = 0;
    for (const path of [
      '/_ohne/cms/records/Posts/../../../collections/Users',
      '/_ohne/cms/records/Posts%2F..%2F..%2Froutes%2Fresolve',
      '/_ohne/cms/records/%2E%2E',
      '/_ohne/cms/records/posts',
      '/_ohne/cms/records/',
      '/_ohne/cms/records/Posts/not-a-uuid',
      '/_ohne/cms/records/Posts/ABCDEF00-0000-4000-8000-000000000001',
      `/_ohne/cms/records/Posts/${POST}/x`,
      '/_ohne/cms/records/Posts%00',
    ]) {
      assert.equal(await raw(path), 404, path);
    }
    // Each `404` renders the error page, whose layout reads the settings.
    const relayed = api.requests.filter(({ path }) => path !== '/cms/records/Settings');
    assert.deepEqual(relayed, []);
    const post = await get('/_ohne/cms/records/Settings', { method: 'POST' });
    assert.equal(post.response.status, 405);
  });

  const visitor = {
    cookie: `session=s1; ${SANDBOX}=copy-1`,
    authorization: 'Bearer editor',
    'x-forwarded-for': '203.0.113.9',
  };

  test('without `sandbox`, no cookie or credential reaches the API, and none comes back', async () => {
    api.requests.length = 0;
    const page = await get('/about', { headers: { accept: 'text/html', ...visitor } });
    assert.equal(page.response.status, 200);
    assert.equal(page.response.headers.get('x-robots-tag'), null);
    assert.equal(page.response.headers.get('set-cookie'), null);
    assert.doesNotMatch(page.html, /name="robots"/);
    assert.ok(api.requests.length > 0);
    for (const { headers } of api.requests) {
      assert.equal(headers.cookie, undefined);
      assert.equal(headers.authorization, undefined);
      assert.equal(headers['x-forwarded-for'], undefined);
    }
    api.requests.length = 0;
    const relayed = await get('/_ohne/cms/records/Settings', { headers: visitor });
    assert.equal(relayed.response.headers.get('set-cookie'), null);
    assert.deepEqual(
      api.requests.map(({ headers }) => [
        headers.cookie,
        headers.authorization,
        headers['x-forwarded-for'],
      ]),
      [[undefined, undefined, '203.0.113.9, 127.0.0.1']],
    );
    assert.equal((await get('/_ohne/sandbox/frame.js')).response.status, 404);
    assert.equal((await get('/_ohne/sandbox')).response.status, 404);
  });

  const MESSAGES = '/_ohne/collections/messages';
  const json = { 'content-type': 'application/json' };
  const message = JSON.stringify({ email: 'ada@example.com', message: 'Hello' });
  const created = () => api.requests.filter(({ path }) => path.startsWith('/collections/'));

  /**
   * The status a create through the site gets for `body` with `headers`, the spam check passed.
   */
  async function post(headers: Record<string, string>, body: BodyInit = message, at = origin) {
    const response = await fetch(`${at}${MESSAGES}`, {
      method: 'POST',
      headers: { 'spam-token': 'human', ...headers },
      body,
      ...(body instanceof ReadableStream && { duplex: 'half' }),
    } as RequestInit);
    await response.body?.cancel();
    return response.status;
  }

  test('a create relays its body, type, language and named headers, and nothing else', async () => {
    api.requests.length = 0;
    const response = await fetch(`${origin}${MESSAGES}?select=[email]`, {
      method: 'POST',
      headers: {
        ...visitor,
        'content-type': 'application/json; charset=utf-8',
        'accept-language': 'de',
        'spam-token': 'human',
        'sec-fetch-site': 'same-origin',
        origin,
        'ohne-preview': 'tok',
        'x-forwarded-host': 'evil.test',
        'x-forwarded-proto': 'https',
        'x-other': '1',
      },
      body: message,
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).UUID, 'm1');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), null);
    const [relayed, ...more] = created();
    assert.deepEqual(more, []);
    assert.equal(relayed?.path, '/collections/messages');
    assert.equal(relayed.body, message);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(relayed.headers).filter(
          ([name]) => !['host', 'connection', 'content-length'].includes(name),
        ),
      ),
      {
        'content-type': 'application/json; charset=utf-8',
        'accept-language': 'de',
        'spam-token': 'human',
        'x-forwarded-for': '203.0.113.9, 127.0.0.1',
        accept: '*/*',
        'accept-encoding': 'gzip, deflate',
        'sec-fetch-mode': 'cors',
        'user-agent': 'node',
      },
    );
  });

  test('a refused create resolves with its status, messages and `retry-after`', async () => {
    const ohne = createOhne<CMS>({ api: `${origin}/_ohne` });
    const spam = { headers: { 'spam-token': 'human' } };
    assert.deepEqual(
      await ohne.create('Messages', { email: 'ada@example.com', message: 'Hi' }, spam),
      {
        ok: true,
        UUID: 'm1',
      },
    );
    assert.deepEqual(await ohne.create('Messages', { email: 'nope', message: 'Hi' }, spam), {
      ok: false,
      status: 422,
      message: 'Invalid input',
      errors: { email: 'Not an email: *' },
    });
    assert.deepEqual(await ohne.create('Messages', { email: 'ada@example.com', message: 'Hi' }), {
      ok: false,
      status: 403,
      message: 'Spam check failed',
      errors: {},
    });
    const flood = await fetch(`${origin}${MESSAGES}`, {
      method: 'POST',
      headers: { ...json, 'spam-token': 'human' },
      body: JSON.stringify({ email: 'ada@example.com', message: 'flood' }),
    });
    assert.equal(flood.status, 429);
    assert.equal(flood.headers.get('retry-after'), '30');
  });

  test('without its name in `ohne.headers`, a header stays on the site', async (t) => {
    const unnamed = await serve({ NUXT_OHNE_HEADERS: '[]' });
    t.after(unnamed.kill);
    api.requests.length = 0;
    assert.equal(await post(json, message, unnamed.origin), 403);
    assert.equal(created()[0]?.headers['spam-token'], undefined);
  });

  test('the create route takes only `POST`, and only a collection segment', async () => {
    const get = await fetch(`${origin}${MESSAGES}`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
    const records = await fetch(`${origin}/_ohne/cms/records/Posts`, { method: 'POST' });
    assert.equal(records.status, 405);
    assert.equal(records.headers.get('allow'), 'GET, HEAD');
    api.requests.length = 0;
    for (const path of [
      '/_ohne/collections/posts/query',
      '/_ohne/collections/messages/verdicts',
      `/_ohne/collections/messages/${POST}`,
      '/_ohne/collections/Messages',
      '/_ohne/collections/messages%2Fquery',
      '/_ohne/collections/%2E%2E',
      '/_ohne/collections/..',
      '/_ohne/collections/-messages',
      '/_ohne/collections/messages-',
      '/_ohne/collections/2fa',
      '/_ohne/collections/',
    ]) {
      assert.equal(await raw(path, 'POST'), 404, path);
    }
    assert.deepEqual(created(), []);
  });

  test('a create from another site is refused, and one from no browser passes', async () => {
    api.requests.length = 0;
    for (const site of ['cross-site', 'same-site', 'none']) {
      assert.equal(await post({ ...json, 'sec-fetch-site': site, origin }), 403, site);
    }
    for (const other of ['http://evil.test', 'null', `${origin}.evil.test`]) {
      assert.equal(await post({ ...json, origin: other }), 403, other);
    }
    assert.deepEqual(created(), []);
    assert.equal(await post({ ...json, origin }), 201);
    assert.equal(
      await post({ ...json, 'sec-fetch-site': 'same-origin', origin: 'https://site.test' }),
      201,
    );
    assert.equal(await post(json), 201);
  });

  test('a create is JSON only', async () => {
    api.requests.length = 0;
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      assert.equal(await post({ 'content-type': type }), 415, type);
    }
    assert.equal(await post({}), 415);
    assert.deepEqual(created(), []);
    assert.equal(await post({ 'content-type': 'Application/JSON ; charset=utf-8' }), 201);
  });

  test('a create body stops at 1 MiB, by its length or as it streams', async () => {
    const sized = (bytes: number) => {
      const shell = JSON.stringify({ email: 'ada@example.com', message: '' });
      return JSON.stringify({
        email: 'ada@example.com',
        message: 'x'.repeat(bytes - shell.length),
      });
    };
    const streamed = (text: string) => {
      const bytes = new TextEncoder().encode(text);
      let at = 0;
      return new ReadableStream({
        pull(controller) {
          controller.enqueue(bytes.slice(at, (at += 64 * 1024)));
          if (at >= bytes.length) controller.close();
        },
      });
    };
    api.requests.length = 0;
    assert.equal(await post(json, sized(1024 * 1024 + 1)), 413);
    assert.equal(await post(json, streamed(sized(1024 * 1024 + 1))), 413);
    assert.deepEqual(created(), []);
    assert.equal(await post(json, sized(1024 * 1024)), 201);
    assert.equal(await post(json, streamed(sized(1024 * 1024))), 201);
    assert.deepEqual(
      created().map(({ body }) => body?.length),
      [1024 * 1024, 1024 * 1024],
    );
  });

  test('a create refused before its body is read still answers, never a reset', async () => {
    const large = 'x'.repeat(8 * 1024 * 1024);
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal(await post(json, large), 413);
      assert.equal(await post({ 'content-type': 'text/plain' }, large), 415);
      assert.equal(await post({ ...json, 'sec-fetch-site': 'cross-site' }, large), 403);
    }
  });

  const nuxt = 'window.nuxtApp';
  const text = (selector: string) => `document.querySelector('${selector}')?.textContent`;
  const open = async (path: string) => {
    await browser.goto(`${origin}${path}`);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('h1')} === '${path.slice(1)}'`);
  };

  test('client navigation resolves once through the site, and the layout and head follow', async () => {
    await open('/about');
    api.hits.length = 0;
    await browser.evaluate(`document.querySelector('.hero a[href="/"]').click()`);
    await browser.until(`${text('h1')} === 'Home'`);
    assert.deepEqual(api.hits, [{ path: '/', token: undefined }]);
    assert.equal(await browser.evaluate(text('header')), 'layout:en:/');
    assert.equal(await browser.evaluate('document.title'), 'Home | Site');
    await browser.evaluate(`${nuxt}.$router.push('/#later')`);
    await browser.until(`location.hash === '#later'`);
    assert.equal(api.hits.length, 1);
    await browser.evaluate(`${nuxt}.$router.push('/de/ueber')`);
    await browser.until(
      `document.documentElement.lang === 'de' && document.title === 'Ueber | Site'`,
    );
    assert.deepEqual(await browser.evaluate(`Object.keys(${nuxt}.payload.state['$sohne:pages'])`), [
      '/',
      '/de/ueber',
    ]);
  });

  test('an `OhneLink` to a page of the site navigates on the client', async () => {
    await open('/contact');
    await browser.evaluate('window.kept = true');
    await browser.evaluate(`document.querySelector('a.about').click()`);
    await browser.until(`${text('h1')} === 'about'`);
    assert.equal(await browser.evaluate('window.kept'), true);
  });

  test('a redirect replaces the history entry on the client', async () => {
    const length = await browser.evaluate('history.length');
    await browser.evaluate(`${nuxt}.$router.push('/old?ref=y')`);
    await browser.until(
      `location.pathname + location.search === '/about?ref=y' && ${text('h1')} === 'about'`,
    );
    assert.equal(await browser.evaluate('history.length'), length + 1);
  });

  test('a miss on the client renders the `404` record, or the error page', async () => {
    await browser.evaluate(`${nuxt}.$router.push('/missing').catch(() => {})`);
    await browser.until(`${text('h1')} === 'Lost: Lost'`);
    assert.equal(await browser.evaluate(text('header')), 'layout:notFound');
    assert.equal(await browser.evaluate('document.title'), 'Site');
    assert.equal(await browser.evaluate(`document.querySelector('link[rel=canonical]')`), null);
    await browser.evaluate(`${nuxt}.$router.push('/gone').catch(() => {})`);
    await browser.until(`${text('.error')} === 'error:404'`);
    assert.equal(await browser.evaluate('location.pathname'), '/gone');
  });

  test('a rich text link to a missing page shows the error page, with no unhandled rejection', async () => {
    await open('/about');
    await browser.evaluate(`document.querySelector('.hero a[href="/gone"]').click()`);
    await browser.until(`${text('.error')} === 'error:404'`);
    assert.deepEqual(
      browser.logs.filter((line) => line.startsWith('exception')),
      [],
    );
  });

  test('an error page hydrates with the preview token, and resolves nothing more', async () => {
    api.hits.length = 0;
    await browser.goto(`${origin}/gone?ohne-preview=tok`);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('.error')} === 'error:404'`);
    assert.equal(await browser.evaluate(`${nuxt}.payload.state['$sohne:token']`), 'tok');
    assert.deepEqual(api.hits, [{ path: '/gone?ohne-preview=tok', token: 'tok' }]);
    api.hits.length = 0;
    await browser.goto(`${origin}/boom`);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('.error')} === 'error:502'`);
    assert.deepEqual(api.hits, [{ path: '/boom', token: undefined }]);
  });

  test('an API failure on the client shows the error page', async () => {
    await open('/about');
    await browser.evaluate(`${nuxt}.$router.push('/boom').catch(() => {})`);
    await browser.until(`${text('.error')} === 'error:502'`);
  });

  const escaped = '?tags=[a%2Cb,new]&e=%3D&c=%3A&t=%60x%60&s=%20b';

  test('a query reaches the cms and a redirect with the bytes the request sent', async () => {
    const { response, hits } = await get(`/old${escaped}`);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), `/about${escaped}`);
    assert.deepEqual(hits, [`/old${escaped}`]);
    assert.deepEqual((await get(`/about${escaped}`)).hits, [`/about${escaped}`]);
  });

  test('an escaped query hydrates on the server key, and keeps its bytes on the client', async () => {
    api.hits.length = 0;
    await browser.goto(`${origin}/about${escaped}`);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('h1')} === 'about'`);
    assert.deepEqual(api.hits, [{ path: `/about${escaped}`, token: undefined }]);
    assert.equal(await browser.evaluate('location.search'), escaped);
    api.hits.length = 0;
    await browser.evaluate(`${nuxt}.$router.push('/team?q=%5Bz%2Cw%5D')`);
    await browser.until(`${text('h1')} === 'team'`);
    await browser.evaluate(`${nuxt}.$router.push('/team?q=%5Bz%2Cw%5D#top')`);
    await browser.until(`location.hash === '#top'`);
    await browser.evaluate(`${nuxt}.$router.push('/old?tags=[a%2Cb]')`);
    await browser.until(`${text('h1')} === 'about'`);
    assert.equal(await browser.evaluate('location.search'), '?tags=[a%2Cb]');
    assert.deepEqual(
      api.hits.map((hit) => hit.path),
      ['/team?q=%5Bz%2Cw%5D', '/old?tags=[a%2Cb]', '/about?tags=[a%2Cb]'],
    );
  });

  test('a later redirect by another guard keeps its own query', async () => {
    const { response, hits } = await get('/onward?tags=[a%2Cb]');
    assert.equal(response.headers.get('location'), '/about?tags=[a,b]');
    assert.deepEqual(hits, ['/about?tags=[a,b]']);
    await open('/about');
    api.hits.length = 0;
    await browser.evaluate(`${nuxt}.$router.push('/tocontact?tags=[a%2Cb]')`);
    await browser.until(`${text('h1')} === 'contact'`);
    await browser.evaluate(`${nuxt}.$router.push('/onward?tags=[a,b]')`);
    await browser.until(`${text('h1')} === 'about'`);
    assert.deepEqual(
      api.hits.map((hit) => hit.path),
      ['/tocontact?tags=[a%2Cb]', '/about?tags=[a,b]'],
    );
  });

  test('a replace keeps the bytes of its query, through a redirect too', async () => {
    await open('/contact');
    api.hits.length = 0;
    await browser.evaluate(`document.querySelector('a.replace').click()`);
    await browser.until(`${text('h1')} === 'team'`);
    await browser.evaluate(`${nuxt}.$router.replace('/old?tags=[c%2Cd]')`);
    await browser.until(`location.search === '?tags=[c%2Cd]' && ${text('h1')} === 'about'`);
    assert.deepEqual(
      api.hits.map((hit) => hit.path),
      ['/team?tags=[a%2Cb,new]', '/old?tags=[c%2Cd]', '/about?tags=[c%2Cd]'],
    );
  });

  test('a navigation that overtakes a replace keeps its own query', async () => {
    await open('/contact');
    api.hits.length = 0;
    await browser.evaluate(`void ${nuxt}.$router.replace('/slow?tags=[x%2Cy]').catch(() => {})`);
    await sleep(200);
    await browser.evaluate(`${nuxt}.$router.push('/slow?tags=[x,y]')`);
    await browser.until(`${text('h1')} === 'slow'`);
    assert.equal(await browser.evaluate('location.search'), '?tags=[x,y]');
    assert.deepEqual(
      api.hits.map((hit) => hit.path),
      ['/slow?tags=[x%2Cy]', '/slow?tags=[x,y]'],
    );
  });

  test('a list reads its next page through the site, and a layout follows the locale', async () => {
    api.requests.length = 0;
    await open('/posts');
    const read = () => api.requests.filter(({ path }) => path.startsWith('/cms/records/')).length;
    assert.equal(read(), 2);
    await browser.evaluate(`document.querySelector('a.older').click()`);
    await browser.until(`${text('.pager')} === '2/3'`);
    assert.deepEqual(
      await browser.evaluate(`[...document.querySelectorAll('.post')].map((p) => p.textContent)`),
      ['Post 3', 'Post 2'],
    );
    assert.equal(read(), 3);
    await browser.evaluate(`${nuxt}.$router.push('/de/ueber')`);
    await browser.until(`${text('.copyright')} === '© de'`);
    await browser.evaluate(`document.querySelector('.menu a[href="/posts"]').click()`);
    await browser.until(`${text('h1')} === 'posts' && ${text('.pager')} === '1/3'`);
  });

  test('a form creates through the site, and shows what the API refused', async () => {
    await open('/message');
    api.requests.length = 0;
    const submit = (email: string) =>
      browser.evaluate(`document.querySelector('[name=email]').value = '${email}';
        document.querySelector('button').click()`);
    await submit('nope');
    await browser.until(`${text('.error')}?.startsWith('Not an email: ')`);
    await submit('ada@example.com');
    await browser.until(`${text('.sent')} === 'sent m1'`);
    assert.deepEqual(
      created().map(({ path, body, headers }) => [path, body, headers['x-forwarded-for']]),
      [
        ['/collections/messages', '{"email":"nope","message":"Hello"}', '127.0.0.1'],
        ['/collections/messages', '{"email":"ada@example.com","message":"Hello"}', '127.0.0.1'],
      ],
    );
  });

  test('hydration matches the server', () => {
    assert.deepEqual(
      browser.logs.filter((line) => /hydrat|mismatch/i.test(line)),
      [],
    );
  });

  const draft = (title: string) => {
    const body = [{ kind: 'paragraph', content: [{ text: title }] }];
    return {
      ...page('/about', title),
      record: {
        UUID: 'page:/about',
        title,
        content: [{ block: 'Text', UUID: 'draft', fields: { body } }],
      },
    };
  };

  test('the editor frame shows each unsaved change', async () => {
    await browser.goto(editor);
    await browser.until(`window.received?.includes('hello')`);
    const frame = await browser.frame(origin);
    await browser.evaluate(`send(${JSON.stringify(draft('Draft title'))})`);
    await browser.until(`${text('h1')} === 'Draft title'`, frame);
    assert.equal(await browser.evaluate(text('[data-ohne-block="draft"]'), frame), 'Draft title');
    assert.equal(await browser.evaluate(text('header'), frame), 'layout:en:/about');
    assert.equal(await browser.evaluate('location.search', frame), '?tags=[a%2Cb]');
  });

  test('a change to the edited record never lands on another page in the frame', async () => {
    const frame = await browser.frame(origin);
    api.hits.length = 0;
    await browser.evaluate(`${nuxt}.$router.push('/')`, frame);
    await browser.until(`${text('h1')} === 'Home preview tok'`, frame);
    assert.deepEqual(api.hits, [{ path: '/', token: 'tok' }]);
    await browser.evaluate(`send(${JSON.stringify(draft('Draft again'))})`);
    await sleep(500);
    assert.equal(await browser.evaluate(text('h1'), frame), 'Home preview tok');
    await browser.evaluate(`${nuxt}.$router.push('/de/about')`, frame);
    await browser.until(`${text('h1')} === 'about de tok'`, frame);
    await browser.evaluate(`send(${JSON.stringify(draft('Draft again'))})`);
    await sleep(500);
    assert.equal(await browser.evaluate(text('h1'), frame), 'about de tok');
    assert.equal(await browser.evaluate('document.documentElement.lang', frame), 'de');
    await browser.evaluate('history.go(-2)', frame);
    await browser.until(`${text('h1')} === 'about preview tok'`, frame);
    await browser.evaluate(`send(${JSON.stringify(draft('Draft again'))})`);
    await browser.until(`${text('h1')} === 'Draft again'`, frame);
  });

  test('a preview frame that leaves for a missing page shows its error page', async () => {
    await browser.goto(editor);
    await browser.until(`window.received?.includes('hello')`);
    const frame = await browser.frame(origin);
    await browser.evaluate(
      `window.loads = 0; document.querySelector('iframe').onload = () => loads++`,
    );
    await browser.evaluate(`location.assign('/gone')`, frame);
    await browser.until('loads === 1');
    await browser.until(`${text('.error')} === 'error:404'`, await browser.frame(origin));
  });

  test("with `sandbox`, a page reads the visitor's copy, privately and unindexed", async () => {
    api.requests.length = 0;
    const response = await fetch(`${sandboxed.origin}/about`, {
      headers: { accept: 'text/html', ...visitor },
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.deepEqual(
      api.requests.map(({ path }) => path.split('?')[0]),
      ['/cms/routes/resolve', '/cms/records/Settings'],
    );
    for (const { headers } of api.requests) {
      assert.equal(headers.cookie, `${SANDBOX}=copy-1`);
      assert.equal(headers.authorization, undefined);
      assert.equal(headers['x-forwarded-for'], undefined);
    }
  });

  test('with `sandbox`, the relay passes that one cookie on, and none back', async () => {
    api.requests.length = 0;
    const list = await fetch(`${sandboxed.origin}/_ohne/cms/records/Posts?page=2`, {
      headers: visitor,
    });
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('cache-control'), 'private, no-store');
    assert.equal(list.headers.get('set-cookie'), null);
    const status = await fetch(`${sandboxed.origin}/_ohne/sandbox`, { headers: visitor });
    assert.deepEqual(await status.json(), { phase: 'live', changedAt: api.state.changedAt });
    assert.equal(status.headers.get('set-cookie'), null);
    assert.deepEqual(
      api.requests.map(({ path, headers }) => [path, headers.cookie, headers.authorization]),
      [
        ['/cms/records/Posts?page=2', `${SANDBOX}=copy-1`, undefined],
        ['/sandbox', `${SANDBOX}=copy-1`, undefined],
      ],
    );
    const script = await fetch(`${sandboxed.origin}/_ohne/sandbox/frame.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /export function connect/);
  });

  test('with `sandbox`, a create carries that one cookie, and answers privately', async () => {
    api.requests.length = 0;
    assert.equal(await post({ ...json, ...visitor }, message, sandboxed.origin), 201);
    const response = await fetch(`${sandboxed.origin}${MESSAGES}`, {
      method: 'POST',
      headers: { ...json, ...visitor, 'spam-token': 'human' },
      body: message,
    });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(
      created().map(({ headers }) => [headers.cookie, headers.authorization]),
      [
        [`${SANDBOX}=copy-1`, undefined],
        [`${SANDBOX}=copy-1`, undefined],
      ],
    );
  });

  test('with `sandbox`, a malformed cookie binds nothing, and the page stays unindexed', async () => {
    for (const cookie of [
      `${SANDBOX}=a%2Fb`,
      `${SANDBOX}="q"`,
      `${SANDBOX}=${'a'.repeat(65)}`,
      `${SANDBOX}=`,
      `x${SANDBOX}=a1`,
      'session=s1',
    ]) {
      api.requests.length = 0;
      const response = await fetch(`${sandboxed.origin}/about`, {
        headers: { accept: 'text/html', cookie },
      });
      assert.match(await response.text(), /<meta name="robots" content="noindex">/, cookie);
      assert.equal(response.headers.get('cache-control'), null, cookie);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex', cookie);
      for (const { headers } of api.requests) assert.equal(headers.cookie, undefined, cookie);
    }
  });

  test('an error page frames as a page does', async (t) => {
    const framing = async (url: string) => {
      const response = await fetch(url, { headers: { accept: 'text/html' } });
      await response.body?.cancel();
      return [response.status, response.headers.get('x-frame-options')];
    };
    assert.deepEqual(await framing(`${origin}/about?ohne-preview=tok`), [200, null]);
    assert.deepEqual(await framing(`${origin}/gone?ohne-preview=tok`), [404, null]);
    assert.deepEqual(await framing(`${origin}/boom?ohne-preview=tok`), [502, null]);
    assert.deepEqual(await framing(`${sandboxed.origin}/about`), [200, null]);
    assert.deepEqual(await framing(`${sandboxed.origin}/gone`), [404, null]);
    assert.deepEqual(await framing(`${origin}/gone`), [404, null]);
    const rules = { '/**': { headers: { 'x-frame-options': 'SAMEORIGIN' } } };
    const guarded = await serve({ NUXT_NITRO_ROUTE_RULES: JSON.stringify(rules) });
    t.after(guarded.kill);
    assert.deepEqual(await framing(`${guarded.origin}/about`), [200, 'SAMEORIGIN']);
    assert.deepEqual(await framing(`${guarded.origin}/gone`), [404, 'SAMEORIGIN']);
    assert.deepEqual(await framing(`${guarded.origin}/boom`), [502, 'SAMEORIGIN']);
  });

  test('with `sandbox`, the server says so once when it starts', async () => {
    const warning = /`ohne\.sandbox` relays the `ohne_sandbox` cookie/g;
    const end = Date.now() + 2000;
    while (!warning.test(sandboxed.stderr()) && Date.now() < end) await sleep(50);
    assert.equal(sandboxed.stderr().match(warning)?.length, 1);
  });

  test('with `sandbox`, a cached route rule refuses to start', async () => {
    const rules = JSON.stringify({ '/news/**': { swr: 60 }, '/docs/**': { cache: false } });
    const started = serve({ NUXT_OHNE_SANDBOX: SANDBOX, NUXT_NITRO_ROUTE_RULES: rules });
    const failure = await started.then(
      (server) => {
        server.kill();
        return assert.fail('the server started');
      },
      (error: Error & { code: number }) => error,
    );
    assert.notEqual(failure.code, 0);
    assert.match(failure.message, /a cached route would share: `\/news\/\*\*`\./);
    const unset = await serve({ NUXT_NITRO_ROUTE_RULES: rules });
    unset.kill();
  });

  test('a framed site outside a demo frame fetches no frame script', async () => {
    api.requests.length = 0;
    await browser.goto(`${editor}/demo`);
    const frame = await browser.frame(sandboxed.origin);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('h1')} === 'about'`, frame);
    await sleep(500);
    assert.deepEqual(
      api.requests.filter(({ path }) => path.startsWith('/sandbox')),
      [],
    );
    assert.deepEqual(await browser.evaluate('received'), []);
  });

  test('a demo frame greets its page, and shows a change to the copy in place', async (t) => {
    t.after(() => {
      api.state.titles.clear();
      api.state.copyright = '©';
    });
    await browser.goto(`${editor}/demo?named`);
    await browser.until(`window.received?.includes('ready')`);
    assert.deepEqual(await browser.evaluate('received'), ['hello', 'ready']);
    const frame = await browser.frame(sandboxed.origin);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('h1')} === 'about'`, frame);
    await browser.evaluate(
      `document.body.style.minHeight = '5000px'; scrollTo(0, 300); window.kept = true`,
      frame,
    );
    api.requests.length = 0;
    await browser.evaluate('shown()');
    await sleep(500);
    assert.deepEqual(
      api.requests.map(({ path }) => path),
      ['/sandbox'],
    );
    api.state.titles.set('/about', 'about changed');
    api.state.copyright = '(c)';
    api.state.changedAt += 1;
    await browser.evaluate('shown()');
    await browser.until(
      `${text('h1')} === 'about changed' && ${text('.copyright')} === '(c) en'`,
      frame,
    );
    assert.equal(await browser.evaluate('window.kept && scrollY', frame), 300);
  });

  test('a demo frame reloads onto the error page of a page its copy dropped', async (t) => {
    t.after(() => api.state.missing.clear());
    await browser.goto(`${editor}/demo?named`);
    await browser.until(`window.received?.includes('ready')`);
    const frame = await browser.frame(sandboxed.origin);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('h1')} === 'about'`, frame);
    api.state.missing.add('/about');
    api.state.changedAt += 1;
    await browser.evaluate('shown()');
    await browser.until(`received.filter((type) => type === 'hello').length === 2`);
    const reloaded = await browser.frame(sandboxed.origin);
    await browser.until(`${text('.error')} === 'error:404'`, reloaded);
  });

  test('a demo frame leaves the error page of a missing page once the copy holds it', async (t) => {
    t.after(() => api.state.missing.clear());
    api.state.missing.add('/new');
    await browser.goto(`${editor}/demo?named`);
    await browser.until(`window.received?.includes('ready')`);
    const frame = await browser.frame(sandboxed.origin);
    await browser.until(`${nuxt} && !${nuxt}.isHydrating && ${text('h1')} === 'about'`, frame);
    await browser.evaluate(
      `window.kept = true; ${nuxt}.$router.push('/new').catch(() => {})`,
      frame,
    );
    await browser.until(`${text('.error')} === 'error:404'`, frame);
    api.state.changedAt += 1;
    await browser.evaluate('shown()');
    await sleep(500);
    assert.equal(await browser.evaluate(`window.kept && ${text('.error')}`, frame), 'error:404');
    api.state.missing.delete('/new');
    api.state.changedAt += 1;
    await browser.evaluate('shown()');
    await browser.until(
      `window.kept && location.pathname === '/new' && ${text('h1')} === 'new'`,
      frame,
    );
  });
}
