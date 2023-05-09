import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import lit from '@astrojs/lit'
import turbolinks from "@astrojs/turbolinks"
import prefetch from "@astrojs/prefetch"

// https://astro.build/config
export default defineConfig({
    integrations: [sitemap(), lit(), turbolinks(), prefetch()],
    site: "https://webwriter.app"
});
