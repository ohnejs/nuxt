/** @import { ListOptions, ReadOptions } from '@ohnejs/client' */
/** @import { MaybeRefOrGetter } from 'vue' */

import { createOhne } from '@ohnejs/client';

import {
  computed,
  showError,
  toValue,
  useAsyncData,
  useNuxtApp,
  useRequestHeader,
  useRequestURL,
  useRoute,
  useRuntimeConfig,
  useState,
  watch,
} from '#imports';

import { addressOf, apiError, PROXY, usePages } from './pages.js';
import { sandboxCookie } from './sandbox.js';

export function useOhne() {
  if (import.meta.client) return createOhne({ api: PROXY });
  const { api, sandbox } = useRuntimeConfig().ohne;
  if (!api)
    throw new Error('Set `ohne.api` in `nuxt.config.ts`, or `NUXT_OHNE_API`, to your ohne API');
  const cookie = sandboxCookie(sandbox, useRequestHeader('cookie'));
  return createOhne(cookie ? { api, fetchInit: { headers: { cookie } } } : { api });
}

export function useOhnePage() {
  const pages = usePages();
  const route = useRoute();
  return computed(() => pages.value[addressOf(route)]);
}

export function useOhneToken() {
  const request = useRequestURL();
  // An error page renders at Nuxt's own error route, while the server's context holds the visited one.
  const url = new URL(useNuxtApp().ssrContext?.url ?? request.href, request);
  return useState('ohne:token', () => url.searchParams.get('ohne-preview') || undefined);
}

/**
 * @param {string} collection
 * @param {MaybeRefOrGetter<string | ReadOptions | undefined>} [uuidOrOptions]
 * @param {MaybeRefOrGetter<ReadOptions | undefined>} [readOptions]
 */
export function useOhneRead(collection, uuidOrOptions, readOptions) {
  // A getter may stand for either, so its value tells a `uuid` from options.
  if (readOptions !== undefined || typeof toValue(uuidOrOptions) === 'string') {
    const uuid = /** @type {MaybeRefOrGetter<string>} */ (uuidOrOptions);
    return useRecords(
      () => `read:${collection}:${toValue(uuid)}`,
      readOptions,
      (ohne, options) => ohne.read(collection, toValue(uuid), options),
    );
  }
  const options = /** @type {MaybeRefOrGetter<ReadOptions | undefined>} */ (uuidOrOptions);
  return useRecords(
    () => `read:${collection}`,
    options,
    (ohne, read) => ohne.read(collection, read),
  );
}

/**
 * @param {string} collection
 * @param {MaybeRefOrGetter<ListOptions | undefined>} [listOptions]
 */
export function useOhneList(collection, listOptions) {
  return useRecords(
    () => `list:${collection}`,
    listOptions,
    (ohne, options) => ohne.list(collection, options),
  );
}

/**
 * Reads the API under `useAsyncData`, keyed by `name` and every option, so a change to either reads again.
 * The locale defaults to the current page's.
 * A failed read is the `502` error page.
 *
 * @template {ReadOptions} O
 * @param {() => string} name
 * @param {MaybeRefOrGetter<O | undefined>} options
 * @param {(ohne: ReturnType<typeof useOhne>, options: O) => Promise<unknown>} read
 */
async function useRecords(name, options, read) {
  const ohne = useOhne();
  const page = useOhnePage();
  const resolved = computed(() => {
    const { locale } = /** @type {{ locale?: string } | undefined} */ (page.value) ?? {};
    return /** @type {O} */ ({ locale, ...toValue(options) });
  });
  // `useAsyncData` takes no `undefined`, so a miss travels as `null`.
  const asyncData = useAsyncData(
    () => `ohne:${name()}:${JSON.stringify(resolved.value)}`,
    async () => (await read(ohne, resolved.value)) ?? null,
  );
  const record = computed(() => asyncData.data.value ?? undefined);
  if (import.meta.client) watch(asyncData.error, (cause) => cause && showError(apiError(cause)));
  const { error } = await asyncData;
  if (error.value) throw apiError(error.value);
  return record;
}
