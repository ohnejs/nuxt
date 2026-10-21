// The page carries its own warnings, so a test reads them without racing the dev server's log.
export default defineNuxtPlugin((nuxtApp) => {
  const warnings = useState<string[]>('warnings', () => []);
  nuxtApp.vueApp.config.warnHandler = (message) => warnings.value.push(message);
});
