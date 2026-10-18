<script setup lang="ts">
import type { Blocks } from '../../../ohne';

defineProps<{ fields: Blocks['Hero'] }>();
</script>

<template>
  <section class="hero">
    <h2>{{ fields.heading }}</h2>
    <OhneRichText :value="fields.body" />
  </section>
</template>
