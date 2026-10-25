/** @import { Resolved, SEO } from '@ohnejs/client' */
/** @import { NuxtApp } from '#app' */
/** @import { Router } from '#vue-router' */
/** @import { Page } from './pages.js' */

import { connect } from '@ohnejs/client';

import {
  computed,
  defineNuxtPlugin,
  refreshNuxtData,
  useHead,
  useRequestHeader,
  useResponseHeader,
  useRouter,
  useRuntimeConfig,
} from '#imports';

import { useOhne, useOhnePage, useOhneToken } from './composables.js';
import { addressOf, PROXY, usePages, useSandbox, watchReplace } from './pages.js';
import { sandboxCookie } from './sandbox.js';

/**
 * The name a demo gives the frame that shows the site; the editor's own preview frame has none.
 */
const SANDBOX_FRAME = 'ohne-sandbox';

export default defineNuxtPlugin({
  name: 'ohne',
  setup(nuxtApp) {
    const token = useOhneToken();
    const sandbox = useSandbox();
    const page = useOhnePage();
    useHead(computed(() => headOf(page.value, Boolean(token.value) || sandbox.value)));

    if (import.meta.server) {
      const bound = sandboxCookie(useRuntimeConfig().ohne.sandbox, useRequestHeader('cookie'));
      const headers =
        token.value || bound
          ? useOhne().previewHeaders()
          : sandbox.value
            ? { 'x-robots-tag': 'noindex' }
            : {};
      for (const [name, value] of Object.entries(headers)) {
        useResponseHeader(name).value = value;
      }
    }

    if (import.meta.client) {
      const pages = usePages();
      const router = useRouter();
      watchReplace(router);
      // The page being left still renders until the next one resolves, so it keeps its entry.
      router.afterEach((to, from) => {
        const kept = new Set([addressOf(to), addressOf(from)]);
        for (const address of Object.keys(pages.value)) {
          if (!kept.has(address)) delete pages.value[address];
        }
      });
      if (sandbox.value && window.parent !== window && window.name === SANDBOX_FRAME) {
        joinSandbox(nuxtApp, router);
      }
      if (!token.value) return;
      nuxtApp.hook('app:mounted', () => {
        connect({
          api: PROXY,
          onData: (next) => {
            const address = addressOf(router.currentRoute.value);
            const record = recordOf(next);
            // The editor sends its own record's page, which another page in the frame must not take.
            if (record !== undefined && record === recordOf(pages.value[address])) {
              pages.value[address] = /** @type {Page} */ (next);
            }
          },
        });
      });
    }
  },
});

/**
 * Joins the demo that frames the site, once the app mounts, through the demo's own frame script.
 * Each change the visitor makes to their copy then refreshes the page in place, keeping scroll and state.
 * The page resolves again, then every `useAsyncData` reads again.
 * A script that fails to load leaves the page as it is.
 *
 * @param {NuxtApp} nuxtApp
 * @param {Router} router
 */
function joinSandbox(nuxtApp, router) {
  const ohne = useOhne();
  const pages = usePages();
  const token = useOhneToken();
  const refresh = async () => {
    const address = addressOf(router.currentRoute.value);
    // An error page leaves the router on the route before it, and a page still missing shows it again.
    if (nuxtApp.payload.error) {
      await router.replace(router.options.history.location).catch(() => {});
    } else if (address in pages.value) {
      const page = await ohne.resolve(address, { token: token.value });
      // Only the server answers a redirect or a missing page with its status.
      if (page.kind === 'redirect' || (page.kind === 'notFound' && !page.page)) {
        return location.reload();
      }
      pages.value[address] = /** @type {Page} */ (page);
    }
    await nuxtApp.runWithContext(() => refreshNuxtData());
  };
  nuxtApp.hook('app:mounted', () => {
    // A dynamic import resolves a path against the bundle, which a CDN may serve from another origin.
    const url = new URL(`${PROXY}/sandbox/frame.js`, location.href).href;
    import(/* @vite-ignore */ url)
      .then((frame) => frame.connect({ onRefresh: () => refresh().catch(() => location.reload()) }))
      .catch(() => {});
  });
}

/**
 * The record a resolved page shows and the locale it reads in, if it shows a record.
 * A translatable record keeps its UUID in every locale, so the UUID alone names no page.
 *
 * @param {(Resolved | Page) & { locale?: string } | undefined} page
 */
function recordOf(page) {
  const UUID =
    page?.kind === 'page' ? page.UUID : page?.kind === 'notFound' ? page.page?.UUID : undefined;
  return UUID === undefined ? undefined : JSON.stringify([UUID, page?.locale]);
}

/**
 * The head tags of a resolved page, the set `renderHead` writes, and the page's language.
 * A page without `seo` adds no title, so the app's own title shows.
 * A preview or a demo asks search engines to stay away.
 *
 * @param {(Page & { seo?: SEO; locale?: string }) | undefined} page
 * @param {boolean} noindex
 */
function headOf(page, noindex) {
  const seo = page?.seo;
  const meta = [
    { name: 'description', content: seo?.description },
    { property: 'og:title', content: seo?.title },
    { property: 'og:description', content: seo?.description },
    { property: 'og:image', content: seo?.image },
    { name: 'robots', content: noindex ? 'noindex' : seo?.robots },
  ].filter(({ content }) => content);
  if (!seo) return { meta };
  const link =
    page.kind === 'page'
      ? [
          { rel: /** @type {const} */ ('canonical'), href: seo.canonical },
          ...page.alternates.map(({ hreflang, href }) => ({
            rel: /** @type {const} */ ('alternate'),
            hreflang,
            href,
          })),
        ]
      : [];
  return { title: seo.title, htmlAttrs: { lang: page.locale }, meta, link };
}
