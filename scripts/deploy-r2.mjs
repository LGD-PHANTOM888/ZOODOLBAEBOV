import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'deploy.local.json');
const DIST = path.join(ROOT, 'dist');
const TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8', canvas: 'application/json; charset=utf-8',
  bat: 'application/octet-stream', woff2: 'font/woff2', woff: 'font/woff',
};
const mediaType = (key) => TYPES[key.split('.').pop()?.toLowerCase()] || 'application/octet-stream';

function normalizeBase(value) {
  const base = String(value || '/').trim();
  if (base === '/' || !base) return '/';
  return `/${base.replace(/^\/+|\/+$/g, '')}/`;
}

async function loadConfig() {
  let raw;
  try {
    raw = await fs.readFile(CONFIG_PATH, 'utf8');
  } catch (_) {
    console.log('[R2] deploy.local.json не найден — загрузка в R2 пропущена.');
    return null;
  }
  const config = JSON.parse(raw);
  const missing = ['accountId', 'bucket', 'accessKeyId', 'secretAccessKey']
    .filter((field) => !config[field]);
  if (missing.length) {
    console.log(`[R2] Не заполнены поля: ${missing.join(', ')}. Загрузка пропущена.`);
    return null;
  }
  return config;
}

async function walk(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(full, rel));
    else if (entry.isFile()) files.push({ full, rel: rel.split(path.sep).join('/') });
  }
  return files;
}

async function md5(full) {
  const hash = crypto.createHash('md5');
  for await (const chunk of createReadStream(full)) hash.update(chunk);
  return hash.digest('hex');
}

async function pool(items, limit, task) {
  let index = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await task(item);
    }
  }));
}

async function main() {
  const config = await loadConfig();
  if (!config) return;

  try {
    await fs.access(DIST);
  } catch (_) {
    console.log('[R2] dist/ не найден — сначала npm run update.');
    process.exitCode = 1;
    return;
  }

  const prefix = normalizeBase(config.basePath).replace(/^\//, '').replace(/\/$/, '');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const remote = new Map();
  let marker;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix ? `${prefix}/` : undefined,
      ContinuationToken: marker,
      MaxKeys: 1000,
    }));
    for (const item of page.Contents || []) remote.set(item.Key, item);
    marker = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (marker);

  const local = await walk(DIST);
  const wanted = new Set();
  const upload = [];
  let skipped = 0;

  for (const file of local) {
    const key = prefix ? `${prefix}/${file.rel}` : file.rel;
    wanted.add(key);
    const stat = await fs.stat(file.full);
    const existing = remote.get(key);
    const digest = await md5(file.full);
    if (existing && Number(existing.Size) === stat.size
        && String(existing.ETag || '').replace(/^"|"$/g, '') === digest) {
      skipped++;
      continue;
    }
    upload.push({ ...file, key, size: stat.size });
  }

  for (const key of remote.keys()) {
    if (!wanted.has(key)) upload.push({ delete: true, key });
  }

  const totalMb = (upload.filter((item) => !item.delete).reduce((sum, item) => sum + item.size, 0) / 1048576).toFixed(1);
  console.log(`[R2] Файлов: ${local.length}, без изменений: ${skipped}, к загрузке: ${upload.filter((item) => !item.delete).length} (${totalMb} МБ), к удалению: ${upload.filter((item) => item.delete).length}.`);

  await pool(upload, 6, async (item) => {
    if (item.delete) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: item.key }));
      return;
    }
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: item.key,
      Body: createReadStream(item.full),
      ContentLength: item.size,
      ContentType: mediaType(item.key),
      CacheControl: item.key.includes('/_astro/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
    }));
  });

  console.log(`[R2] Готово. Сайт: ${normalizeBase(config.basePath)}`);
}

main().catch((error) => {
  console.error('[R2] Ошибка загрузки:', error.message);
  process.exit(1);
});
