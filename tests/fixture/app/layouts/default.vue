<script setup lang="ts">
const page = useOhnePage();
const label = computed(() => {
  if (page.value?.kind === 'page') return `${page.value.locale}:${page.value.path}`;
  return page.value?.kind ?? 'none';
});
const settings = await useOhneRead('Settings');
</script>

<template>
  <div>
    <header class="layout">layout:{{ label }}</header>
    <nav class="menu">
      <OhneLink v-for="item in settings.menu" :key="item.label" :link="item.link">
        {{ item.label }}
      </OhneLink>
    </nav>
    <slot />
    <footer class="copyright">{{ settings.copyright }}</footer>
  </div>
</template>
