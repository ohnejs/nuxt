import type { Schema, UntypedSchema } from '@ohnejs/client';
import type { NuxtModule } from 'nuxt/schema';

/**
 * The `ohne` key of `nuxt.config.ts`.
 */
export interface ModuleOptions {
  /**
   * The origin of your ohne API, like `'https://api.example.com'`.
   * Only the server reads it, so it may be an address on a private network.
   * The browser reads through the site's own `/_ohne` routes instead.
   * `NUXT_OHNE_API` replaces it when the server starts.
   */
  api: string;

  /**
   * The types file the cms writes, relative to the Nuxt root.
   * Its `CMS` types every page; while the file is missing, pages read untyped.
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
}

/**
 * Holds your `CMS` under `cms`.
 * The module fills it from your types file, so you never write it.
 */
export interface Register {}

/**
 * Your `CMS`, or `UntypedSchema` while there is no types file.
 * A types file from another version of `@ohnejs/client` reads untyped too, and `nuxt typecheck` names it.
 */
export type RegisteredCMS = Register extends { cms: infer S extends Schema } ? S : UntypedSchema;

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
