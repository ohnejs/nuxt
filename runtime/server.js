import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  getRequestWebStream,
  useRuntimeConfig,
} from '#imports';

import { sandboxCookie } from './sandbox.js';

const ROUTES = new Map([
  ['/_ohne/cms/routes/resolve', '/cms/routes/resolve'],
  ['/_ohne/cms/preview.js', '/cms/preview.js'],
  ['/sitemap.xml', '/cms/sitemap.xml'],
  ['/robots.txt', '/cms/robots.txt'],
]);
const SANDBOX_ROUTES = new Map([
  ['/_ohne/sandbox', '/sandbox'],
  ['/_ohne/sandbox/frame.js', '/sandbox/frame.js'],
]);
const RECORDS =
  /^\/_ohne\/cms\/records\/([A-Z][A-Za-z0-9]*)(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/;
const CREATE = /^\/_ohne\/collections\/([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)$/;
const BODY_LIMIT = 1024 * 1024;
const RELAYED = ['content-type', 'accept-language'];
const PASSED = ['cache-control', 'content-type', 'retry-after', 'vary', 'x-robots-tag'];

/** @typedef {Parameters<typeof getRequestHeader>[0]} Event */

export default defineEventHandler(async (event) => {
  const { pathname, search } = getRequestURL(event);
  const { api, sandbox, headers: allowed } = useRuntimeConfig(event).ohne;
  const create = CREATE.exec(pathname);
  const target = create ? `/collections/${create[1]}` : targetOf(pathname, Boolean(sandbox));
  if (!target) throw createError({ status: 404 });
  const { method } = event;
  const methods = create ? ['POST'] : ['GET', 'HEAD'];
  if (!methods.includes(method)) {
    return new Response(null, { status: 405, headers: { allow: methods.join(', ') } });
  }
  /** @type {Record<string, string>} */
  const relayed = {};
  /** @type {Blob | undefined} */
  let body;
  if (create) {
    const admitted = await admit(event);
    if (admitted instanceof Response) return admitted;
    body = admitted;
    for (const name of [...RELAYED, ...allowed]) {
      const value = getRequestHeader(event, name);
      if (value) relayed[name] = value;
    }
  } else {
    const token = getRequestHeader(event, 'ohne-preview');
    if (token) relayed['ohne-preview'] = token;
  }
  const forwarded = forwardedFor(event);
  if (forwarded) relayed['x-forwarded-for'] = forwarded;
  const cookie = sandboxCookie(sandbox, getRequestHeader(event, 'cookie'));
  if (cookie) relayed.cookie = cookie;
  const upstream = await fetch(`${api.replace(/\/+$/, '')}${target}${create ? '' : search}`, {
    method,
    headers: relayed,
    body,
  }).catch(() => {
    throw createError({ status: 502 });
  });
  const headers = new Headers();
  for (const name of PASSED) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (cookie) headers.set('cache-control', 'private, no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
});

/**
 * The API path a read relays to, or `undefined` for one the site never relays.
 * A records path is rebuilt from its captured name and `UUID`, so no other segment reaches the API.
 *
 * @param {string} pathname
 * @param {boolean} sandbox
 */
function targetOf(pathname, sandbox) {
  const records = RECORDS.exec(pathname);
  if (records) return `/cms/records/${records[1]}${records[2] ? `/${records[2]}` : ''}`;
  return ROUTES.get(pathname) ?? (sandbox ? SANDBOX_ROUTES.get(pathname) : undefined);
}

/**
 * The body of a create the site relays, or the status that refuses it.
 * A create comes from the site's own pages, as JSON of at most `BODY_LIMIT` bytes.
 * The browser's `Sec-Fetch-Site` tells where it came from; without one, the `Origin` host must be the site's.
 * A request with neither, like one from a server, could post to the API itself, so it passes.
 * A refusal before the body is read lets Node drain it, so the client reads the status instead of a reset.
 *
 * @param {Event} event
 * @returns {Promise<Blob | Response>}
 */
async function admit(event) {
  const site = getRequestHeader(event, 'sec-fetch-site');
  const origin = getRequestHeader(event, 'origin');
  const host = origin && URL.parse(origin)?.host;
  const foreign = site
    ? site !== 'same-origin'
    : origin && host !== getRequestHeader(event, 'host');
  if (foreign) return new Response(null, { status: 403 });
  const type = getRequestHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') return new Response(null, { status: 415 });
  if (Number(getRequestHeader(event, 'content-length')) > BODY_LIMIT) {
    return new Response(null, { status: 413 });
  }
  const reader = getRequestWebStream(event)?.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
    size += read.value.byteLength;
    if (size > BODY_LIMIT) {
      // Canceling the stream h3 builds over Node's request would throw on its next chunk.
      event.node.req.pause();
      return new Response(null, { status: 413, headers: { connection: 'close' } });
    }
    chunks.push(read.value);
  }
  return new Blob(/** @type {BlobPart[]} */ (chunks));
}

/**
 * The `X-Forwarded-For` a relay sends: the chain the visitor's request carried, then the peer the site saw.
 * The API trusts it only from a peer in its `api.trustProxy`, reading from the right.
 * So a chain the visitor forged only stays left of the peer.
 *
 * @param {Event} event
 */
function forwardedFor(event) {
  const peer = event.node.req.socket?.remoteAddress;
  return [getRequestHeader(event, 'x-forwarded-for'), peer].filter(Boolean).join(', ');
}
