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
</script>

<template>
  <!-- @vue-expect-error `blocks` is a list. -->
  <OhneBlocks :blocks="5" />
  <!-- @vue-expect-error `value` is rich text. -->
  <OhneRichText :value="'x'" />
  <!-- @vue-expect-error A link holds a `url` or a `collection`. -->
  <OhneLink :link="{ href: '/x' }">x</OhneLink>
</template>
