import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'deploy.local.json');
const WRANGLER_PATH = path.join(ROOT, 'wrangler.toml');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (_) {
  console.log('[Worker] deploy.local.json не найден — деплой Worker пропущен.');
  process.exit(0);
}

if (!fs.existsSync(WRANGLER_PATH)) {
  console.error('[Worker] wrangler.toml не найден — сначала node scripts/setup-r2.mjs.');
  process.exit(1);
}

const env = { ...process.env };
if (config.apiToken) env.CLOUDFLARE_API_TOKEN = config.apiToken;
else console.log('[Worker] API Token не задан — wrangler использует вход через браузер (npx wrangler login).');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['wrangler', 'deploy', '--config', 'wrangler.toml'], {
  cwd: ROOT, stdio: 'inherit', env, shell: process.platform === 'win32',
});
if (result.status !== 0) {
  console.error('[Worker] Деплой не удался.');
  process.exit(1);
}
console.log('[Worker] Деплой завершён.');
