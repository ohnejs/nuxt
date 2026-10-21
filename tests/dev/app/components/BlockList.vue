<script setup lang="ts">
defineProps<{ blocks: readonly { block: string; UUID: string; fields: object }[] }>();
</script>

<template>
  <OhneBlocks :blocks="blocks" />
</template>
