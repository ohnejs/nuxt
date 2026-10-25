<script setup lang="ts">
const page = useOhnePage();
const api: string = useRuntimeConfig().ohne.api;
// @ts-expect-error A preview token is a string.
const token: number | undefined = useOhneToken().value;
if (page.value?.kind === 'page' && page.value.collection === 'Pages') {
  // @ts-expect-error `title` is text.
  const title: number = page.value.record.title;
  // @ts-expect-error `Pages` has no `nope`.
  const nope: unknown = page.value.record.nope;
}
// @ts-expect-error The middleware answers a redirect itself.
const redirect = page.value?.kind === 'redirect';

const settings = await useOhneRead('Settings');
const copyright: string | null = settings.value.copyright;
// @ts-expect-error `Settings` holds one record, read without a `uuid`.
useOhneRead('Settings', 'x');
// @ts-expect-error `Settings` holds one record, never a list.
useOhneList('Settings');
// @ts-expect-error `Posts` reads one record by its `uuid`.
useOhneRead('Posts');
// @ts-expect-error `Locale` is `en`.
useOhneRead('Settings', { locale: 'de' });
const post = await useOhneRead('Posts', () => 'x', { select: ['title'] });
const postTitle: string | undefined = post.value?.title;
// @ts-expect-error `select` leaves `publishedAt` out.
const publishedAt: unknown = post.value?.publishedAt;
// @ts-expect-error A miss reads `undefined`.
const sure: string = post.value.title;
const posts = await useOhneList('Posts', { order: ['-publishedAt'], where: { title: 'x' } });
const lastPage: number = posts.value.lastPage;
const path: string | undefined = posts.value.records[0]?.path;
// @ts-expect-error `Posts` has no `nope` to order by.
useOhneList('Posts', { order: ['nope'] });
// @ts-expect-error `Posts` has no `nope` to select.
useOhneList('Posts', { select: ['nope'] });
const ohne = useOhne();
const created = await ohne.create('Messages', { email: 'a@b.c', message: 'Hi' });
const field: string | undefined = created.ok ? created.UUID : created.errors.email;
// @ts-expect-error A visitor may not create in `Posts`.
ohne.create('Posts', { title: 'x' });
// @ts-expect-error `Messages` asks for a `message`.
ohne.create('Messages', { email: 'a@b.c' });
// @ts-expect-error `Messages` has no `status`.
ohne.create('Messages', { email: 'a@b.c', message: 'Hi', status: 'x' });
</script>

<template>
  <!-- @vue-expect-error `blocks` is a list. -->
  <OhneBlocks :blocks="5" />
  <!-- @vue-expect-error `value` is rich text. -->
  <OhneRichText :value="'x'" />
  <!-- @vue-expect-error A link holds a `url` or a `collection`. -->
  <OhneLink :link="{ href: '/x' }">x</OhneLink>
</template>
