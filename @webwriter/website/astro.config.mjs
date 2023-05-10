import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import lit from '@astrojs/lit'

// https://astro.build/config
export default defineConfig({
    integrations: [sitemap(), lit()],
    site: "https://webwriter.app"
});
