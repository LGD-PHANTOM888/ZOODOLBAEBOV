import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkCallouts from './src/plugins/remark-callouts.mjs';
import rehypeBase from './src/plugins/rehype-base.mjs';

// GitHub Pages:site/base вычисляются сами из GITHUB_REPOSITORY.
// Для своего домена задайте SITE_URL и SITE_BASE в настройках репозитория.
const githubRepo = process.env.GITHUB_REPOSITORY || '';
const [owner = '', repo = ''] = githubRepo.split('/');
const isUserPage = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
const autoSite = githubRepo ? `https://${owner}.github.io` : 'https://example.github.io';
const autoBase = githubRepo && !isUserPage ? `/${repo}/` : '/';

const site = process.env.SITE_URL || autoSite;
const base = process.env.SITE_BASE || autoBase;

export default defineConfig({
  site,
  base,
  output: 'static',
  markdown: {
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
