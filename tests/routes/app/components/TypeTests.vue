<script setup lang="ts">
const api = useOhneAPI();
const sites: { code: string; name: string }[] = await api.call('GET /sites', {
  query: { client: 'acme' },
});
// @ts-expect-error `GET /sites` reads a `client`.
api.call('GET /sites');
const site: { name: string } = await api.call('GET /sites/[code]', { params: { code: 'a' } });
// @ts-expect-error `GET /sites/[code]` names a `code`.
api.call('GET /sites/[code]');
// @ts-expect-error The API serves no `GET /nope`.
api.call('GET /nope');
const email: string | undefined = (await api.user())?.email;
// @ts-expect-error A site reads no CMS.
useOhne();
</script>

<template>
  <p>{{ sites.length }} {{ site.name }} {{ email }}</p>
</template>
