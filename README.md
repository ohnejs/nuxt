# @ohnejs/nuxt

Renders the pages of an ohne CMS in Nuxt. Each path resolves on the server, redirects and `404`s answer with the right status, the `<head>` fills itself, and the editor's live preview just works.

## Install

```sh
pnpm add @ohnejs/nuxt @ohnejs/client
```

## Configure

List the module and name your API:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@ohnejs/nuxt'],
  ohne: { api: 'http://localhost:9001' },
  app: { head: { title: 'My site' } },
});
```

Only the server reads `ohne.api`. The browser reads through the site's own `/_ohne` routes, so the API needs no CORS and may sit on a private network.

The module types every page from the `ohne.ts` file the cms writes next to `nuxt.config.ts`. Point the cms at it with `cms.types` in its config. Name another file with `ohne.types`.

## The page

One catch-all page renders every path the cms answers. An `app/app.vue` hides it unless it renders `<NuxtPage />`, so delete the one Nuxt's starter ships:

```vue
<!-- app/pages/[...slug].vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'ohne' });

const page = useOhnePage();
</script>

<template>
  <main v-if="page?.kind === 'page' && page.collection === 'Pages'">
    <h1>{{ page.record.title }}</h1>
    <OhneBlocks :blocks="page.record.content" />
  </main>
  <main v-else-if="page?.kind === 'notFound' && page.page">
    <h1>{{ page.page.title }}</h1>
    <OhneBlocks :blocks="page.page.content" />
  </main>
</template>
```

The `ohne` middleware resolves the path and query once, on the server, before the page renders:

- A page fills `useOhnePage()`. Checking `collection` narrows `record` to that collection's fields.
- A redirect answers with its own code, `301`, `302`, `307` or `308`, and never renders anything.
- A path no page answers renders your cms page with the slug `404`, with a `404` status. Without one, Nuxt's error page shows a `404`.
- An API that fails shows Nuxt's error page with a `502`.

After the first load, each navigation resolves in the browser through `/_ohne`.

## Blocks

`OhneBlocks` renders each block with the component Nuxt names `Blocks` plus the block's name. So `app/components/blocks/Hero.vue` renders every `Hero` block. A component whose name starts with `Blocks` is a block component.

Each block component takes the block's fields as one `fields` prop:

```vue
<!-- app/components/blocks/Hero.vue -->
<script setup lang="ts">
import type { Blocks } from '~~/ohne';

defineProps<{ fields: Blocks['Hero'] }>();
</script>

<template>
  <section class="hero">
    <h2>{{ fields.heading }}</h2>
    <OhneRichText :value="fields.body" />
  </section>
</template>
```

Its root element gets `data-ohne-block`, which the editor uses to outline the block in the preview. Keep one root element, so the attribute has a place to land.

A block without a component renders nothing. `nuxt typecheck` names it, like ``Block `Gallery` has no component``.

## Rich text and links

`OhneRichText` renders a rich text value in a `<div>`. Pass `inline` for an inline field, and it renders a `<span>` with a `<br>` between blocks instead:

```vue
<OhneRichText :value="fields.body" />
<OhneRichText :value="fields.caption" inline />
```

A click on a link to one of your pages navigates on the client, like a `NuxtLink`.

`OhneLink` renders a link field as a `NuxtLink`, opening a new tab when the link says so:

```vue
<OhneLink :link="fields.button" class="button">{{ fields.label }}</OhneLink>
```

A link without an address a browser may follow, like one to an unpublished page, renders its content in a `<span>`. Your classes still land on it.

## Layouts

`useOhnePage()` works anywhere, not only in the page. A layout reads the same page, with no second request:

```vue
<!-- app/layouts/default.vue -->
<script setup lang="ts">
const page = useOhnePage();
</script>

<template>
  <div>
    <nav v-if="page?.kind === 'page'">
      <a v-for="{ hreflang, href } in page.alternates" :key="hreflang" :href="href">{{ hreflang }}</a>
    </nav>
    <slot />
  </div>
</template>
```

To read another path, like a footer page, use the client directly. Pass the preview token, so the editor's drafts show there too:

```vue
<!-- app/components/SiteFooter.vue -->
<script setup lang="ts">
const ohne = useOhne();
const token = useOhneToken();
const { data: footer } = await useAsyncData('footer', () => ohne.resolve('/footer', { token: token.value }));
</script>

<template>
  <footer v-if="footer?.kind === 'page'">{{ footer.record.title }}</footer>
</template>
```

## The head

The module fills the `<head>` from the page: the title, description, share tags, `robots`, the canonical link, a link per translation, and `<html lang>`. These are the tags the cms's own `renderHead` writes.

A page without SEO data adds no title, so `app.head.title` from your config shows. That includes the `404` page.

## Preview

The editor frames your site with a preview token in the address. The module does the rest:

- Pages read with the token, so drafts show.
- The response is `private, no-store` and `noindex`, so no cache or search engine keeps it.
- The site connects to the editor, and each unsaved change shows at once.

The token stays for the whole visit, even after the editor's script drops it from the address bar.

## Sitemap and robots

The site serves `/sitemap.xml` and `/robots.txt` from the cms. A `robots.txt` in `public/` wins, so delete the one Nuxt's starter ships, or keep your own there.

## Production

Set `NUXT_OHNE_API` on the server, and it replaces `ohne.api` when the server starts. One build then serves every environment:

```sh
NUXT_OHNE_API=http://cms.internal:9001 node .output/server/index.mjs
```

When that address is private, set `API_URL` on the cms to the API's public URL. The cms builds upload URLs from it, and the browser cannot load an image from a private address.

## TypeScript

`nuxt typecheck` runs `vue-tsc`, which needs TypeScript 6. Install both with `pnpm add -D typescript@6 vue-tsc`, and keep `typescript` at 6 in your Nuxt app, even if the rest of your workspace uses 7.

A types file from another version of `@ohnejs/client` leaves your pages untyped. `nuxt typecheck` names it, like `` `ohne.ts` was written for another version of `@ohnejs/client` ``. Have the cms that matches your client write it again.

The full guide lives at [ohne.dev/docs/cms/frameworks](https://ohne.dev/docs/cms/frameworks#nuxt).
