/** @import { Link, RichText } from '@ohnejs/client' */
/** @import { PropType, Ref } from 'vue' */

/** @typedef {{ block: string; UUID: string; fields: object }} Block */

import { interceptLinks, linkHref, richTextToHTML } from '@ohnejs/client';

import { NuxtLink } from '#components';
import {
  defineComponent,
  h,
  navigateTo,
  onBeforeUnmount,
  onMounted,
  ref,
  resolveComponent,
  useNuxtApp,
} from '#imports';

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' };

export const OhneBlocks = defineComponent({
  name: 'OhneBlocks',
  props: {
    blocks: {
      type: /** @type {PropType<readonly Block[] | null>} */ (Array),
      default: undefined,
    },
  },
  setup(props) {
    return () =>
      (props.blocks ?? []).map((block) => {
        const component = resolveComponent(`Blocks${block.block}`);
        if (typeof component === 'string') return null;
        return h(component, {
          key: block.UUID,
          'data-ohne-block': block.UUID,
          fields: block.fields,
        });
      });
  },
});

export const OhneRichText = defineComponent({
  name: 'OhneRichText',
  props: {
    value: { type: /** @type {PropType<RichText | null>} */ (Array), default: undefined },
    inline: Boolean,
  },
  setup(props) {
    const nuxtApp = useNuxtApp();
    /** @type {Ref<Element | undefined>} */
    const root = ref();
    /** @type {(() => void) | undefined} */
    let dispose;
    onMounted(() => {
      // A page that fails to load shows the error page, so its rejected navigation needs no handler.
      dispose = interceptLinks(/** @type {Element} */ (root.value), (path) => {
        Promise.resolve(nuxtApp.runWithContext(() => navigateTo(path))).catch(() => {});
      });
    });
    onBeforeUnmount(() => dispose?.());
    return () =>
      h(props.inline ? 'span' : 'div', {
        ref: root,
        innerHTML: richTextToHTML(props.value, { inline: props.inline }),
      });
  },
});

export const OhneLink = defineComponent({
  name: 'OhneLink',
  props: { link: { type: /** @type {PropType<Link | null>} */ (Object), default: undefined } },
  setup(props, { slots }) {
    return () => {
      const to = linkHref(props.link);
      if (to === undefined) return h('span', slots.default?.());
      return h(NuxtLink, { to, ...(props.link?.newTab === true && NEW_TAB) }, slots);
    };
  },
});
