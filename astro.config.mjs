import { execFileSync } from 'node:child_process';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkCallouts from './src/plugins/remark-callouts.mjs';
import rehypeBase from './src/plugins/rehype-base.mjs';

// GitHub Pages:site/base вычисляются сами из GITHUB_REPOSITORY,
// а локально — из origin, чтобы сборка наблюдателя совпадала с Actions.
// Для своего домена задайте SITE_URL и SITE_BASE в настройках репозитория.
function repoFromOrigin() {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    return match ? `${match[1]}/${match[2]}` : '';
  } catch {
    return '';
  }
}

const githubRepo = process.env.GITHUB_REPOSITORY || repoFromOrigin();
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
