<script setup lang="ts">
import type { NuxtError } from '#app';

defineProps<{ error: NuxtError }>();
</script>

<template>
  <NuxtLayout>
    <p class="error">error:{{ error.statusCode }}</p>
  </NuxtLayout>
</template>
