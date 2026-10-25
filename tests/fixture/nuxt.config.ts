export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@ohnejs/nuxt'],
  app: { head: { title: 'Site' } },
  ohne: { api: 'http://127.0.0.1:9599', headers: ['Spam-Token'] },
});
