import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import vue from "@astrojs/vue"
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
    integrations: [sitemap(), mdx(), vue({devtools: true, appEntrypoint: '/src/pages/_app'})],
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
    },
    i18n: {
      defaultLocale: "en",
      locales: ["en", "de"],
      fallback: {
        "de": "en"
      },
      routing: {
        fallbackType: "rewrite"
      }
    },
    redirects: {
      "/news": "/news/1",
      "/de/news": "/de/news/1"
    }
});
