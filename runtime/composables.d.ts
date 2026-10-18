import type { Ohne, Resolved, ResolvedRedirect } from '@ohnejs/client';
import type { ComputedRef, Ref } from 'vue';

import type { RegisteredCMS } from '../module.js';

/**
 * The client of your ohne API, as `createOhne` makes it.
 * It reads the API on the server, and the site's own `/_ohne` routes in the browser.
 *
 * @example
 * ```ts
 * const footer = await useOhne().resolve('/footer')
 * ```
 */
export function useOhne(): Ohne<RegisteredCMS>;

/**
 * The page the `ohne` middleware resolved for the current path, or `undefined` before it ran.
 * A path no page answers reads `{ kind: 'notFound' }`, with the record of your `404` page when there is one.
 * While the editor frames the site, it follows each unsaved change.
 *
 * @example
 * ```ts
 * const page = useOhnePage()
 *
 * page.value?.kind === 'page' && page.value.record // -> the record, typed by its collection
 * ```
 */
export function useOhnePage(): ComputedRef<
  Exclude<Resolved<RegisteredCMS>, ResolvedRedirect> | undefined
>;

/**
 * The preview token the editor framed the site with, or `undefined` outside a preview.
 * It outlives the `ohne-preview` query param, which the editor's script drops from the address bar.
 *
 * @example
 * ```ts
 * const token = useOhneToken()
 * const footer = await useOhne().resolve('/footer', { token: token.value })
 * ```
 */
export function useOhneToken(): Readonly<Ref<string | undefined>>;
