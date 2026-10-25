/** @import { Resolved, ResolvedRedirect } from '@ohnejs/client' */
/** @import { RegisteredCMS } from '../module.js' */
/** @import { RouteLocationNormalized, Router } from '#vue-router' */

import { createError, useRuntimeConfig, useState } from '#imports';

/**
 * A page the `ohne` middleware resolved: anything but a redirect, which it answers itself.
 *
 * @typedef {Exclude<Resolved<RegisteredCMS>, ResolvedRedirect>} Page
 */

/**
 * The site's own route the browser reads the API through.
 */
export const PROXY = '/_ohne';

/** @type {string | undefined} */
let replaced;

/**
 * Whether the server relays a sandbox cookie, which keeps every page out of search engines.
 * The payload carries it, since the browser never sees the server's config.
 *
 * @example
 * ```ts
 * useSandbox().value // -> true while `ohne.sandbox` names a cookie
 * ```
 */
export function useSandbox() {
  return useState('ohne:sandbox', () => Boolean(useRuntimeConfig().ohne?.sandbox));
}

/**
 * The `502` a failed read of the API shows, as Nuxt's error page.
 *
 * @example
 * ```ts
 * apiError(new Error('ohne answered 500 for /cms/records/Settings')) // -> NuxtError, status 502
 * ```
 *
 * @param {unknown} cause
 */
export function apiError(cause) {
  return createError({
    status: 502,
    message: /** @type {Error} */ (cause).message,
    cause,
    fatal: true,
  });
}

/**
 * Each resolved page by the address it answers, as the `ohne` middleware writes it.
 *
 * @example
 * ```ts
 * usePages().value['/about'] // -> { kind: 'page', UUID: '...', record: { ... }, ... }
 * ```
 */
export function usePages() {
  return useState('ohne:pages', () => /** @type {Record<string, Page>} */ ({}));
}

/**
 * The path and query the cms resolves: the hash never reaches a server.
 *
 * @example
 * ```ts
 * addressOf({ fullPath: '/about?ref=x#top' }) // -> '/about?ref=x'
 * ```
 *
 * @param {{ fullPath: string }} route
 */
export function addressOf(route) {
  return route.fullPath.replace(/#.*/, '');
}

/**
 * Gives `to` back the query bytes of `url` when it is the same route with its query rebuilt.
 * The router rebuilds Nuxt's first route and a guard's redirect from their parsed query, which decodes `%2C`.
 * With the bytes back, the address, the history entry and every later `fullPath` agree on server and client.
 *
 * @example
 * ```ts
 * keepQuery(router, to, '/old?tags=[a%2Cb]') // to.fullPath was '/old?tags=[a,b]'
 * to.fullPath                                // -> '/old?tags=[a%2Cb]'
 * ```
 *
 * @param {Router} router
 * @param {RouteLocationNormalized & { href?: string }} to
 * @param {string | URL} url
 */
export function keepQuery(router, to, url) {
  const { pathname, search } = new URL(url, 'http://site');
  const raw = router.resolve(pathname + search + to.hash);
  if (raw.fullPath === to.fullPath || router.resolve({ ...raw }).fullPath !== to.fullPath) return;
  Object.assign(to, { fullPath: raw.fullPath, href: raw.href });
}

/**
 * Keeps the string each `router.replace` is given for the guard pass of its navigation.
 * The router parses it into an object before any guard runs, which decodes `%2C`.
 *
 * @param {Router} router
 */
export function watchReplace(router) {
  const replace = router.replace;
  router.replace = (to) => {
    replaced = typeof to === 'string' ? to : undefined;
    return replace(to).finally(() => {
      if (replaced === to) replaced = undefined;
    });
  };
}

/**
 * The string the last `router.replace` was given, if no guard has taken it yet.
 */
export function takeReplaced() {
  const to = replaced;
  replaced = undefined;
  return to;
}
