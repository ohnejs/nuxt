import type { RouteMap, Schema, UntypedRoutes, UntypedSchema } from '@ohnejs/client';
import type { NuxtModule } from 'nuxt/schema';

/**
 * The `ohne` key of `nuxt.config.ts`.
 */
export interface ModuleOptions {
  /**
   * The address of your ohne API, like `'https://api.example.com'`.
   * With `cms: false` it ends in the API's `api.basePath`, like `'https://api.example.com/api'`.
   * Only the server reads it, so it may be an address on a private network.
   * The browser calls the site instead: its `/_ohne` routes, or with `cms: false` that path.
   * `NUXT_OHNE_API` replaces it when the server starts.
   */
  api: string;

  /**
   * The types file your backend writes, relative to the Nuxt root.
   * Its `CMS` types every page, or with `cms: false` its `Routes` types every call.
   * While the file is missing, both read untyped.
   *
   * @default
   * 'ohne.ts'
   */
  types?: string;

  /**
   * The cookie that binds a visitor to a sandbox copy of the API, set only for a live demo.
   * The server relays that one cookie to the API, so a page shows the visitor's copy.
   * Every page then answers `noindex`, and a page read with the cookie is never cached.
   * The server refuses to start with a cached route rule, which would share one visitor's copy.
   * `NUXT_OHNE_SANDBOX` replaces it when the server starts.
   * Never set it on a real site.
   *
   * @default
   * ''
   */
  sandbox?: string;

  /**
   * Headers a form's `create` may pass through the site to the API, like a spam check's `recaptcha-token`.
   * Every other header the visitor sends stays on the site, cookies and `authorization` among them.
   * The module refuses a credential, `host`, `origin` and each `x-forwarded-` header.
   *
   * @default
   * []
   */
  headers?: string[];

  /**
   * Whether the site renders pages from an ohne CMS.
   * `false` drops the CMS composables, the components, the page middleware and the head plugin.
   * It drops `/_ohne`, `/sitemap.xml`, `/robots.txt` and the error page handler too, and adds `useOhneAPI`.
   *
   * @default
   * true
   */
  cms?: boolean;
}

/**
 * Holds your `CMS` under `cms`, or your `Routes` under `routes`.
 * The module fills it from your types file, so you never write it.
 */
export interface Register {}

/**
 * Your `CMS`, or `UntypedSchema` while there is no types file.
 * A types file from another version of `@ohnejs/client` reads untyped too, and `nuxt typecheck` names it.
 */
export type RegisteredCMS = Register extends { cms: infer S extends Schema } ? S : UntypedSchema;

/**
 * Your `Routes`, or `UntypedRoutes` while there is no types file.
 */
export type RegisteredRoutes = Register extends { routes: infer R extends RouteMap }
  ? R
  : UntypedRoutes;

/**
 * Renders the pages of an ohne CMS: it resolves each path, fills the `<head>`, and joins the live preview.
 * List it in `modules` and name your API under `ohne`.
 *
 * @example
 * ```ts
 * export default defineNuxtConfig({
 *   modules: ['@ohnejs/nuxt'],
 *   ohne: { api: 'http://localhost:9001' },
 * })
 * ```
 */
declare const module: NuxtModule<ModuleOptions>;

export default module;
