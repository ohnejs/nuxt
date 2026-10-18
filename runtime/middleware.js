/** @import { Page } from './pages.js' */

import {
  createError,
  defineNuxtRouteMiddleware,
  navigateTo,
  setResponseStatus,
  useNuxtApp,
  useRequestEvent,
} from '#imports';

import { useOhne, useOhneToken } from './composables.js';
import { addressOf, usePages } from './pages.js';

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp = useNuxtApp();
  const pages = usePages();
  const address = addressOf(to);
  // Hydration finds the page the server resolved, and a hash change keeps the page it has.
  const kept = nuxtApp.isHydrating || addressOf(from) === address;
  if (import.meta.client && kept && address in pages.value) return;
  // An error page never resolves again: the failed pass already did, and left any miss on the error.
  if (nuxtApp.payload.error && (import.meta.server || nuxtApp.isHydrating)) {
    const miss = /** @type {Page | undefined} */ (nuxtApp.payload.error.data);
    if (miss?.kind === 'notFound') pages.value[address] = miss;
    return;
  }
  const event = useRequestEvent();
  const token = useOhneToken().value;

  let page;
  try {
    page = await useOhne().resolve(address, { token });
  } catch (cause) {
    throw createError({
      status: 502,
      message: /** @type {Error} */ (cause).message,
      cause,
      fatal: true,
    });
  }

  if (page.kind === 'redirect') {
    // The server answers the redirect itself, so it never resolves the target too.
    const external = import.meta.server || !/^\/(?![/\\])/.test(page.to);
    return nuxtApp.runWithContext(() => navigateTo(page.to, { redirectCode: page.code, external }));
  }
  pages.value[address] = page;
  if (page.kind === 'page') return;
  // Returned, not thrown, the server renders the error page without logging a missing page as a failure.
  if (!page.page) return createError({ status: 404, data: page, fatal: import.meta.client });
  if (event) setResponseStatus(event, 404);
});
