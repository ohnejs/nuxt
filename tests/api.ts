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

/**
 * A stand-in ohne API on a free port that records every resolve with its path and token.
 * It serves `preview` as its preview script.
 */
export async function startAPI(preview: string) {
  const hits: { path: string; token: string | undefined }[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://api');
    const send = (
      status: number,
      type: string,
      text: string,
      headers: Record<string, string> = {},
    ) => {
      response.writeHead(status, { 'content-type': type, ...headers }).end(text);
    };
    if (url.pathname === '/cms/sitemap.xml') return send(200, 'application/xml', '<urlset/>');
    if (url.pathname === '/cms/robots.txt') return send(200, 'text/plain', 'User-agent: *');
    if (url.pathname === '/cms/preview.js') return send(200, 'text/javascript', preview);
    if (url.pathname !== '/cms/routes/resolve') return send(404, 'text/plain', 'no');
    const path = url.searchParams.get('path')!;
    const token = request.headers['ohne-preview'] as string | undefined;
    hits.push({ path, token });
    const { pathname, search } = new URL(path, 'http://site');
    const privately = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };
    const json = (value: object) =>
      send(200, 'application/json', JSON.stringify(value), token ? privately : {});
    if (pathname === '/old') return json({ kind: 'redirect', to: `/about${search}`, code: 301 });
    if (pathname === '/away')
      return json({ kind: 'redirect', to: 'https://example.com/x', code: 302 });
    if (pathname === '/missing')
      return json({ kind: 'notFound', page: record('page:404', 'Lost') });
    if (pathname === '/vermisst') {
      const seo = { title: 'Vermisst | Site', canonical: 'https://site.test/de/404' };
      return json({ kind: 'notFound', locale: 'de', page: record('page:de/404', 'Vermisst'), seo });
    }
    if (pathname === '/gone') return json({ kind: 'notFound' });
    if (pathname === '/boom') return send(500, 'application/json', '{}');
    if (pathname === '/de/ueber') return json(page(pathname, 'Ueber', 'de'));
    if (pathname === '/de/about') {
      const about = page('/about', `about de ${token}`, 'de');
      return json({ ...about, path: pathname });
    }
    const title = pathname === '/' ? 'Home' : pathname.slice(1);
    return json(page(pathname, token ? `${title} preview ${token}` : title));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, hits, close: () => server.close() };
}
