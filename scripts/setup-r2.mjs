import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'deploy.local.json');
const WRANGLER_PATH = path.join(ROOT, 'wrangler.toml');

function repoFromOrigin() {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = remote.match(/\/([^/]+?)(?:\.git)?\/?$/);
    return match ? match[1] : '';
  } catch (_) {
    return '';
  }
}

let existing = {};
try {
  existing = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
} catch (_) {}

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (label, value = '') => {
  const answer = await rl.question(`${label}${value ? ` [${value}]` : ''}: `);
  return answer.trim() || value;
};
const yes = async (label, value = true) => {
  const answer = await rl.question(`${label} [${value ? 'y' : 'n'}]: `);
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return value;
  return normalized === 'y' || normalized === 'yes' || normalized === 'да';
};

console.log('Cloudflare R2: весь сайт в одном бакете.');
console.log('1) В Cloudflare Dashboard создайте R2 bucket (например, zoopark-site).');
console.log('2) R2 -> Manage R2 API Tokens -> Create API Token: Object Read & Write, выберите bucket.');
console.log('3) Account ID возьмите из URL аккаунта. Ключи и токены сохраняются только локально.\n');

const accountId = await ask('Account ID', existing.accountId || '');
const bucket = await ask('Bucket name', existing.bucket || 'zoopark-site');
const accessKeyId = await ask('R2 Access Key ID', existing.accessKeyId || '');
const secretAccessKey = await ask('R2 Secret Access Key', existing.secretAccessKey || '');
const apiToken = await ask('Cloudflare API Token (для Worker, можно позже)', existing.apiToken || '');
const basePath = await ask('Base path сайта', existing.basePath || `/${repoFromOrigin() || 'ZOODOLBAEBOV'}/`);
const disableGitHubPages = await yes('Не пушить в GitHub после настройки R2 (быстрее)', existing.disableGitHubPages !== false);
rl.close();

if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
  console.error('Не заполнены обязательные поля. Настройка прервана.');
  process.exit(1);
}

const config = {
  accountId,
  bucket,
  accessKeyId,
  secretAccessKey,
  apiToken,
  basePath: basePath.startsWith('/') ? basePath : `/${basePath}`,
  disableGitHubPages,
};
await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

const name = `zoopark-${accountId.slice(-6).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'site'}`;
const wrangler = `name = "${name}"
main = "worker.js"
compatibility_date = "2026-11-26"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "${bucket}"

[vars]
BASE_PATH = "${config.basePath.replace(/\/$/, '') || '/'}"
`;
await fs.writeFile(WRANGLER_PATH, wrangler, 'utf8');

console.log('\nГотово: deploy.local.json и wrangler.toml созданы локально (в git не попадают).');
console.log('Дальше: npm run deploy:worker (или Настройка Cloudflare R2.bat).');
console.log('Ссылка на сайт появится в выводе wrangler: https://<name>.<subdomain>.workers.dev' + config.basePath);
