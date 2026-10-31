import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output only: no server runtime, no database, nothing to patch on the host.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // The CSP forbids inline styles and scripts, so never inline them.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      // Do not inline small assets as data: URIs or inline scripts.
      assetsInlineLimit: 0,
    },
  },
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
