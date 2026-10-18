import { createOhne } from '@ohnejs/client';

import {
  computed,
  useNuxtApp,
  useRequestURL,
  useRoute,
  useRuntimeConfig,
  useState,
} from '#imports';

import { addressOf, PROXY, usePages } from './pages.js';

export function useOhne() {
  if (import.meta.client) return createOhne({ api: PROXY });
  const { api } = useRuntimeConfig().ohne;
  if (!api)
    throw new Error('Set `ohne.api` in `nuxt.config.ts`, or `NUXT_OHNE_API`, to your ohne API');
  return createOhne({ api });
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
