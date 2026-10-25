<script setup lang="ts">
const ohne = useOhne();
const sent = ref('');
const failure = ref('');
const errors = ref<Partial<Record<string, string>>>({});

async function send(event: Event) {
  const form = new FormData(event.target as HTMLFormElement);
  const result = await ohne.create(
    'Messages',
    { email: String(form.get('email')), message: String(form.get('message')) },
    { headers: { 'spam-token': 'human' } },
  );
  if (result.ok) sent.value = result.UUID ?? '';
  else [failure.value, errors.value] = [result.message, result.errors];
}
</script>

<template>
  <main>
    <h1>message</h1>
    <p v-if="sent" class="sent">sent {{ sent }}</p>
    <form v-else @submit.prevent="send">
      <input name="email" />
      <p class="error">{{ errors.email }}</p>
      <textarea name="message">Hello</textarea>
      <p class="failure">{{ failure }}</p>
      <button>Send</button>
    </form>
  </main>
</template>
