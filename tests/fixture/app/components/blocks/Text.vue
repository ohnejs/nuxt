<script setup lang="ts">
import type { Blocks } from '../../../ohne';

defineProps<{ fields: Blocks['Text'] }>();
</script>

<template>
  <OhneRichText :value="fields.body" class="text" />
</template>
