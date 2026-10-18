/** @import { Resolved, SEO } from '@ohnejs/client' */
/** @import { Page } from './pages.js' */

import { connect } from '@ohnejs/client';

import { computed, defineNuxtPlugin, useHead, useResponseHeader, useRouter } from '#imports';

import { useOhne, useOhnePage, useOhneToken } from './composables.js';
import { addressOf, PROXY, usePages } from './pages.js';

export default defineNuxtPlugin({
  name: 'ohne',
  setup(nuxtApp) {
    const token = useOhneToken();
    const page = useOhnePage();
    useHead(computed(() => headOf(page.value, token.value)));

    if (import.meta.server && token.value) {
      for (const [name, value] of Object.entries(useOhne().previewHeaders())) {
        useResponseHeader(name).value = value;
      }
    }

    if (import.meta.client) {
      const pages = usePages();
      const router = useRouter();
      // The page being left still renders until the next one resolves, so it keeps its entry.
      router.afterEach((to, from) => {
        const kept = new Set([addressOf(to), addressOf(from)]);
        for (const address of Object.keys(pages.value)) {
          if (!kept.has(address)) delete pages.value[address];
        }
      });
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
 *
 * @param {(Page & { seo?: SEO; locale?: string }) | undefined} page
 * @param {string | undefined} token
 */
function headOf(page, token) {
  const seo = page?.seo;
  const meta = [
    { name: 'description', content: seo?.description },
    { property: 'og:title', content: seo?.title },
    { property: 'og:description', content: seo?.description },
    { property: 'og:image', content: seo?.image },
    { name: 'robots', content: token ? 'noindex' : seo?.robots },
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
