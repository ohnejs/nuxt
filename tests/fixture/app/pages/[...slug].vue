<script setup lang="ts">
definePageMeta({ middleware: 'ohne' });

const page = useOhnePage();
</script>

<template>
  <main v-if="page?.kind === 'page' && page.collection === 'Pages'">
    <h1>{{ page.record.title }}</h1>
    <OhneBlocks :blocks="page.record.content" />
  </main>
  <main v-else-if="page?.kind === 'notFound'">
    <h1>Lost: {{ page.page?.title }}</h1>
    <OhneBlocks :blocks="page.page?.content" />
  </main>
</template>
