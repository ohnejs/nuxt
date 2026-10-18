import type { Link, RichText } from '@ohnejs/client';
import type { DefineComponent } from 'vue';

/**
 * Renders each block with the component Nuxt names `Blocks` plus the block's name, like `BlocksHero`.
 * Each block component takes the block's `fields` as its one prop.
 * Its root element carries `data-ohne-block`.
 * A block without a component renders nothing, and `nuxt typecheck` names it.
 *
 * @example
 * ```vue
 * <OhneBlocks :blocks="page.record.content" />
 * ```
 */
export const OhneBlocks: DefineComponent<{
  /**
   * The value of a blocks field.
   */
  blocks: readonly { block: string; UUID: string; fields: object }[] | null | undefined;
}>;

/**
 * Renders a rich text value, and routes clicks on links to your own pages through `navigateTo`.
 *
 * @example
 * ```vue
 * <OhneRichText :value="fields.body" />
 * ```
 */
export const OhneRichText: DefineComponent<{
  /**
   * The value of a rich text field.
   */
  value: RichText | null | undefined;

  /**
   * Renders a `<span>` with a `<br>` between blocks, for an `inline` field, instead of a `<div>`.
   *
   * @default
   * false
   */
  inline?: boolean;
}>;

/**
 * Renders a link value as a `NuxtLink`, opening a new tab when it says so.
 * A link with no address a browser may follow renders its content in a `<span>`.
 *
 * @example
 * ```vue
 * <OhneLink :link="fields.button">{{ fields.label }}</OhneLink>
 * ```
 */
export const OhneLink: DefineComponent<{
  /**
   * The value of a link field.
   */
  link: Link | null | undefined;
}>;
