/** @import { Resolved, ResolvedRedirect } from '@ohnejs/client' */
/** @import { RegisteredCMS } from '../module.js' */

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
