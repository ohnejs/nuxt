<script setup lang="ts">
definePageMeta({ middleware: (to) => navigateTo({ path: '/about', query: to.query }) });
</script>

<template>
  <main />
</template>
