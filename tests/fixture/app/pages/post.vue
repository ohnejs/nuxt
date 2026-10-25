<script setup lang="ts">
const route = useRoute();
const post = await useOhneRead('Posts', () => String(route.query.id));
</script>

<template>
  <main>
    <h1>post</h1>
    <p class="title">{{ post?.title ?? 'none' }}</p>
  </main>
</template>
