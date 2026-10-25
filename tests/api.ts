import type { IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

import { once } from 'node:events';
import { createServer } from 'node:http';

const body = (text: string) => [
  {
    kind: 'paragraph',
    content: [
      { text },
      { text: ' home', link: { url: '/' } },
      { text: ' evil', link: { url: 'javascript:alert(1)' } },
      { text: ' gone', link: { url: '/gone' } },
    ],
  },
];

const record = (UUID: string, title: string) => ({
  UUID,
  _updatedAt: 0,
  title,
  slug: 'x',
  status: 'published',
  publishedAt: null,
  expiresAt: null,
  seo: null,
  content: [
    {
      block: 'Hero',
      UUID: `${UUID}-hero`,
      fields: { heading: `${title} hero`, image: null, body: body('hello') },
    },
    { block: 'Text', UUID: `${UUID}-text`, fields: { body: body('text') } },
    { block: 'Unknown', UUID: `${UUID}-unknown`, fields: {} },
  ],
});

/**
 * The page the stand-in API resolves `path` to, its record identified by the path.
 */
export function page(path: string, title: string, locale = 'en') {
  return {
    kind: 'page' as const,
    collection: 'Pages',
    UUID: `page:${path}`,
    locale,
    path,
    record: record(`page:${path}`, title),
    seo: {
      title: `${title} | Site`,
      description: `${title} description`,
      image: 'https://api.test/share.png',
      canonical: `https://site.test${path}`,
    },
    alternates: [
      { hreflang: 'en', href: `https://site.test${path}` },
      { hreflang: 'x-default', href: `https://site.test${path}` },
      { hreflang: 'de', href: `https://site.test/de${path}` },
    ],
  };
}

const posts = [1, 2, 3, 4, 5].map((n) => ({
  UUID: `00000000-0000-4000-8000-00000000000${n}`,
  path: `/blog/post-${n}`,
  title: `Post ${n}`,
  publishedAt: n,
}));

/**
 * The `GET /cms/records` answer of the stand-in API, or `undefined` for a path it does not hold.
 */
function records(path: string, query: URLSearchParams, copyright: string) {
  if (path === '/cms/records/Settings') {
    return {
      UUID: 'settings',
      menu: [
        { label: 'Home', link: { url: '/' } },
        { label: 'Posts', link: { url: '/posts' } },
      ],
      copyright: `${copyright} ${query.get('locale') ?? 'default'}`,
    };
  }
  const post = posts.find(({ UUID }) => path === `/cms/records/Posts/${UUID}`);
  if (post) return post;
  if (path !== '/cms/records/Posts') return undefined;
  const page = Number(query.get('page') ?? 1);
  const perPage = Number(query.get('perPage') ?? 20);
  const sorted = query.get('order') === '[-publishedAt]' ? posts.toReversed() : posts;
  return {
    records: sorted.slice((page - 1) * perPage, page * perPage),
    total: sorted.length,
    page,
    perPage,
    lastPage: Math.ceil(sorted.length / perPage),
  };
}

/**
 * A stand-in for the frame script a demo's sandbox layer serves, playing the framed side of embed v1.
 * It answers `hello` and `ready`, and calls `onRefresh` on `shown` once `GET /sandbox` moved its `changedAt`.
 */
const FRAME = `export function connect({ onRefresh }) {
  const parent = location.ancestorOrigins[0];
  const post = (type) => window.parent.postMessage({ ohne: 'embed', v: 1, type, signedIn: false }, parent);
  const changedAt = () => fetch(new URL('../sandbox', import.meta.url)).then((r) => r.json()).then((s) => s.changedAt);
  let last = changedAt();
  addEventListener('message', async (event) => {
    if (event.source !== window.parent || event.data?.ohne !== 'embed') return;
    if (event.data.type === 'theme') post('ready');
    if (event.data.type !== 'shown') return;
    const before = await last;
    last = changedAt();
    if ((await last) !== before) onRefresh();
  });
  post('hello');
  return { dispose() {} };
}`;

/**
 * A stand-in ohne API on a free port that records every resolve with its path and token.
 * It keeps every request it gets in `requests`, and serves `preview` as its preview script.
 * Each answer tries to set a cookie, which no site may pass on to its visitor.
 * A create in `Messages` keeps its body, and asks for a `spam-token` of `human` and an email with an `@`.
 * `state` changes what it answers: a page's title by path, the copyright, and the sandbox copy's `changedAt`.
 * A path in `state.missing` resolves to a missing page without one to show.
 */
export async function startAPI(preview: string) {
  const hits: { path: string; token: string | undefined }[] = [];
  const requests: { path: string; headers: IncomingHttpHeaders; body?: string }[] = [];
  const state = {
    titles: new Map<string, string>(),
    missing: new Set<string>(),
    copyright: '©',
    changedAt: 1,
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://api');
    const entry: (typeof requests)[number] = {
      path: url.pathname + url.search,
      headers: request.headers,
    };
    requests.push(entry);
    const send = (
      status: number,
      type: string,
      text: string,
      headers: Record<string, string> = {},
    ) => {
      response
        .writeHead(status, { 'content-type': type, 'set-cookie': 'planted=1; Path=/', ...headers })
        .end(text);
    };
    if (url.pathname === '/cms/sitemap.xml') return send(200, 'application/xml', '<urlset/>');
    if (url.pathname === '/cms/robots.txt') return send(200, 'text/plain', 'User-agent: *');
    if (url.pathname === '/cms/preview.js') return send(200, 'text/javascript', preview);
    if (url.pathname === '/sandbox/frame.js') return send(200, 'text/javascript', FRAME);
    if (url.pathname === '/sandbox') {
      const status = { phase: 'live', changedAt: state.changedAt };
      return send(200, 'application/json', JSON.stringify(status));
    }
    if (url.pathname === '/collections/messages') {
      let text = '';
      request.on('data', (chunk) => (text += chunk));
      return request.on('end', () => {
        entry.body = text;
        const message = JSON.parse(text);
        if (request.headers['spam-token'] !== 'human') {
          return send(403, 'application/json', JSON.stringify({ message: 'Spam check failed' }));
        }
        if (message.message === 'flood') {
          const tooMany = JSON.stringify({ message: 'Too many' });
          return send(429, 'application/json', tooMany, { 'retry-after': '30' });
        }
        if (!String(message.email).includes('@')) {
          const errors = { email: `Not an email: ${request.headers['accept-language']}` };
          const invalid = { statusCode: 422, message: 'Invalid input', data: { errors } };
          return send(422, 'application/json', JSON.stringify(invalid));
        }
        send(201, 'application/json', JSON.stringify({ UUID: 'm1', ...message }));
      });
    }
    if (url.pathname.startsWith('/cms/records/')) {
      const answer = records(url.pathname, url.searchParams, state.copyright);
      if (!answer) return send(404, 'application/json', '{}');
      return send(200, 'application/json', JSON.stringify(answer));
    }
    if (url.pathname !== '/cms/routes/resolve') return send(404, 'text/plain', 'no');
    const path = url.searchParams.get('path')!;
    const token = request.headers['ohne-preview'] as string | undefined;
    hits.push({ path, token });
    const { pathname, search } = new URL(path, 'http://site');
    const privately = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };
    const json = (value: object) =>
      send(200, 'application/json', JSON.stringify(value), token ? privately : {});
    if (pathname === '/old') return json({ kind: 'redirect', to: `/about${search}`, code: 301 });
    if (pathname === '/slow') return void setTimeout(() => json(page(pathname, 'slow')), 1000);
    if (pathname === '/tocontact')
      return json({ kind: 'redirect', to: `/contact${search}`, code: 302 });
    if (pathname === '/away')
      return json({ kind: 'redirect', to: 'https://example.com/x', code: 302 });
    if (pathname === '/missing')
      return json({ kind: 'notFound', page: record('page:404', 'Lost') });
    if (pathname === '/vermisst') {
      const seo = { title: 'Vermisst | Site', canonical: 'https://site.test/de/404' };
      return json({ kind: 'notFound', locale: 'de', page: record('page:de/404', 'Vermisst'), seo });
    }
    if (pathname === '/gone' || state.missing.has(pathname)) return json({ kind: 'notFound' });
    if (pathname === '/boom') return send(500, 'application/json', '{}');
    if (pathname === '/de/ueber') return json(page(pathname, 'Ueber', 'de'));
    if (pathname === '/de/about') {
      const about = page('/about', `about de ${token}`, 'de');
      return json({ ...about, path: pathname });
    }
    const title = state.titles.get(pathname) ?? (pathname === '/' ? 'Home' : pathname.slice(1));
    return json(page(pathname, token ? `${title} preview ${token}` : title));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, hits, requests, state, close: () => server.close() };
}
