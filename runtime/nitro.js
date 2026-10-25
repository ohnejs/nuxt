import { defineNitroPlugin, useRuntimeConfig } from '#imports';

const CACHING = ['cache', 'swr', 'isr', 'prerender'];

/**
 * Guards a server that relays a sandbox cookie: it refuses a cached route, and says once it is a demo.
 * A cached page would serve one visitor's sandbox copy to the next.
 */
export default defineNitroPlugin(() => {
  const { ohne, nitro } = useRuntimeConfig();
  if (!ohne.sandbox) return;
  /** @type {Record<string, Record<string, unknown>>} */
  const rules = nitro?.routeRules ?? {};
  const cached = Object.entries(rules)
    .filter(([, rule]) => CACHING.some((key) => rule[key]))
    .map(([route]) => route);
  if (cached.length > 0) {
    throw new Error(
      `\`ohne.sandbox\` gives each visitor their own copy, which a cached route would share: ${cached.map((route) => `\`${route}\``).join(', ')}. Drop \`cache\`, \`swr\`, \`isr\` and \`prerender\` from its route rules, or unset \`ohne.sandbox\`.`,
    );
  }
  console.warn(
    `[@ohnejs/nuxt] \`ohne.sandbox\` relays the \`${ohne.sandbox}\` cookie to the API and marks every page \`noindex\`. Never set it on a real site.`,
  );
});
