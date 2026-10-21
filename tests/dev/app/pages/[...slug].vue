<script setup lang="ts">
definePageMeta({ middleware: 'ohne' });

const page = useOhnePage();
</script>

<template>
  <main v-if="page?.kind === 'page' && page.collection === 'Pages'">
    <BlockList :blocks="page.record.content" />
  </main>
</template>

<style scoped>
main {
  display: grid;
}
</style>
