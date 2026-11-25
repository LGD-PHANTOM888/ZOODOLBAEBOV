import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkCallouts from './src/plugins/remark-callouts.mjs';
import rehypeBase from './src/plugins/rehype-base.mjs';

// Для GitLab Pages:
//   SITE_URL  = https://ВАС_gitlab_io  (или свой домен)
//   SITE_BASE = /                       (или /имя-проекта/ для project pages)
const site = process.env.SITE_URL || 'https://example.gitlab.io';
const base = process.env.SITE_BASE || '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  markdown: {
    // В Astro 6.4+ процессор по умолчанию — Sätteri; unified нужен для remark/rehype.
    processor: unified({
      remarkPlugins: [remarkCallouts],
      rehypePlugins: [[rehypeBase, { base }]],
      shikiConfig: { theme: 'github-dark', wrap: true },
    }),
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
