<script setup lang="ts">
const api = useOhneAPI();
const { data: user, refresh } = await useAsyncData('user', () => api.user());
const { data: sites } = await useAsyncData('sites', () =>
  api.call('GET /sites', { query: { client: 'acme' } }),
);

async function signIn() {
  const outcome = await api.login({ email: 'ada@example.com', password: 'secret' });
  if (outcome.kind === 'signed-in') await refresh();
}

async function signOut() {
  await api.logout();
  await refresh();
}
</script>

<template>
  <p class="user">{{ user ? user.email : 'signed out' }}</p>
  <p v-for="site in sites" :key="site.code" class="site">{{ site.name }}</p>
  <button class="in" @click="signIn">Sign in</button>
  <button class="out" @click="signOut">Sign out</button>
</template>
