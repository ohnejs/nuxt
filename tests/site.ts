import { createOhne } from '@ohnejs/client';
import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import { page, startAPI } from './api.ts';
import { openBrowser } from './cdp.ts';

const run = promisify(execFile);
const PREVIEW = new URL('../node_modules/@ohnejs/cms/preview/browser.js', import.meta.url);

/**
 * Builds the Nuxt app in `tests/<app>/` and serves it against a stand-in API.
 * It then runs every server and browser test.
 * The app's config names a dead API, so each passing test also proves that `NUXT_OHNE_API` replaces it.
 */
export function suite(app: string) {
  const dir = new URL(`${app}/`, import.meta.url).pathname;
  let api: Awaited<ReturnType<typeof startAPI>>;
  let site: ChildProcess;
  let origin: string;
  let dashboard: Server;
  let editor: string;
  let browser: Awaited<ReturnType<typeof openBrowser>>;

  before(async () => {
    dashboard = createServer((_, response) => {
      response.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html>
<iframe src="${origin}/about?ohne-preview=tok" width="800" height="600"></iframe>
<script>
  window.received = [];
  addEventListener('message', (event) => event.data?.ohne === 1 && received.push(event.data.type));
  window.send = (page) => frames[0].postMessage({ ohne: 1, type: 'data', page }, '${origin}');
</script>`);
    });
    dashboard.listen(0, '127.0.0.1');
    await once(dashboard, 'listening');
    editor = `http://localhost:${(dashboard.address() as AddressInfo).port}`;
    api = await startAPI(
      readFileSync(PREVIEW, 'utf8').replace("'__OHNE_DASHBOARD_ORIGIN__'", JSON.stringify(editor)),
    );

    // Nitro's traced `node_modules` can hold symlink cycles that its next build cannot clear.
    rmSync(`${dir}.output`, { recursive: true, force: true });
    const env = { ...process.env };
    delete env.NUXT_OHNE_API;
    await run('pnpm', ['exec', 'nuxt', 'build'], { cwd: dir, env });
    // Nitro reads `PORT=0` as unset and takes its default, so the free port is found here.
    const probe = createNetServer().listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const { port } = probe.address() as AddressInfo;
    probe.close();
    origin = `http://127.0.0.1:${port}`;
    site = spawn('node', ['.output/server/index.mjs'], {
      cwd: dir,
      env: { ...env, PORT: String(port), HOST: '127.0.0.1', NUXT_OHNE_API: api.origin },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve) =>
      site.stdout!.on('data', (chunk) => String(chunk).includes(origin) && resolve(0)),
    );
    browser = await openBrowser();
  });

  after(async () => {
    await browser?.close();
    site?.kill();
    dashboard?.close();
    api?.close();
  });

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
    assert.match(html, /error:404/);
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
    assert.equal((await get('/_ohne/collections/users')).response.status, 404);
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
    assert.equal(await browser.evaluate('location.search', frame), '');
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
}
