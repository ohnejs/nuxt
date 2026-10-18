export default defineNuxtPlugin((nuxtApp) => {
  Object.assign(window, { nuxtApp });
});
