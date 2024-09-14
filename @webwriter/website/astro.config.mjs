import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import lit from '@astrojs/lit'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from "rehype-autolink-headings"

// https://astro.build/config
export default defineConfig({
    integrations: [sitemap(), lit()],
    site: "https://webwriter.app",
    markdown: {
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, {
          behavior: "wrap",
          headingProperties: {
            className: ['anchor'],
          },
          properties: {
            className: ['anchor-link'],
          },
        }]
      ]
    }
});
