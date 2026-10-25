<script setup lang="ts">
const route = useRoute();
const posts = await useOhneList('Posts', () => ({
  order: ['-publishedAt'],
  page: Number(route.query.page) || 1,
  perPage: 2,
  select: ['title'],
}));
</script>

<template>
  <main>
    <h1>posts</h1>
    <p v-for="post in posts.records" :key="post.UUID" class="post">{{ post.title }}</p>
    <p class="pager">{{ posts.page }}/{{ posts.lastPage }}</p>
    <NuxtLink
      v-if="posts.page < posts.lastPage"
      :to="{ query: { page: posts.page + 1 } }"
      class="older"
    >
      Older
    </NuxtLink>
  </main>
</template>
