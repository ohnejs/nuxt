<script setup lang="ts">
const page = useOhnePage();
const label = computed(() => {
  if (page.value?.kind === 'page') return `${page.value.locale}:${page.value.path}`;
  return page.value?.kind ?? 'none';
});
</script>

<template>
  <div>
    <header class="layout">layout:{{ label }}</header>
    <slot />
  </div>
</template>
