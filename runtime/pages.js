/** @import { Resolved, ResolvedRedirect } from '@ohnejs/client' */
/** @import { RegisteredCMS } from '../module.js' */
/** @import { RouteLocationNormalized, Router } from '#vue-router' */

import { useState } from '#imports';

/**
 * A page the `ohne` middleware resolved: anything but a redirect, which it answers itself.
 *
 * @typedef {Exclude<Resolved<RegisteredCMS>, ResolvedRedirect>} Page
 */

/**
 * The site's own route the browser reads the API through.
 */
export const PROXY = '/_ohne';

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
  const raw = router.resolve(to.path + new URL(url, 'http://site').search + to.hash);
  if (raw.fullPath === to.fullPath || router.resolve({ ...raw }).fullPath !== to.fullPath) return;
  Object.assign(to, { fullPath: raw.fullPath, href: raw.href });
}
