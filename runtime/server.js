import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  useRuntimeConfig,
} from '#imports';

const ROUTES = new Map([
  ['/_ohne/cms/routes/resolve', '/cms/routes/resolve'],
  ['/_ohne/cms/preview.js', '/cms/preview.js'],
  ['/sitemap.xml', '/cms/sitemap.xml'],
  ['/robots.txt', '/cms/robots.txt'],
]);
const PASSED = ['cache-control', 'content-type', 'vary', 'x-robots-tag'];

export default defineEventHandler(async (event) => {
  const { pathname, search } = getRequestURL(event);
  const target = ROUTES.get(pathname);
  if (!target) throw createError({ status: 404 });
  const { method } = event;
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const token = getRequestHeader(event, 'ohne-preview');
  const api = useRuntimeConfig(event).ohne.api.replace(/\/+$/, '');
  const upstream = await fetch(`${api}${target}${search}`, {
    method,
    headers: token ? { 'ohne-preview': token } : {},
  }).catch(() => {
    throw createError({ status: 502 });
  });
  const headers = new Headers();
  for (const name of PASSED) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
});
