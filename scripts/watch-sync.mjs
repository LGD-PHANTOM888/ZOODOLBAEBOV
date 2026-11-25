import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'sync.config.json'), 'utf8'));
const vault = path.resolve(ROOT, config.vault);
const INTERVAL = Number(process.env.SYNC_INTERVAL_MS || 5000);

const stamp = () => new Date().toLocaleString('ru-RU');
const log = (message) => console.log(`[${stamp()}] ${message}`);

function signature() {
  const entries = [];

  function walk(dir, rel = '') {
    let list;
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      log(`⚠ Не удалось прочитать ${dir}: ${error.message}`);
      return;
    }
    for (const entry of list) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        entries.push(`DIR|${relPath}`);
        walk(full, relPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full);
          entries.push(`${relPath}|${stat.size}|${Math.floor(stat.mtimeMs)}`);
        } catch (_) {
          // Файл мог исчезнуть во время обхода — следующий тик всё перечитает.
        }
      }
    }
  }

  walk(vault);
  entries.sort();
  return crypto.createHash('sha1').update(entries.join('\n')).digest('hex');
}

function run(command, args) {
  log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: true });
  return result.status === 0;
}

function hasRemote() {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8', shell: true });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function hasUpstream() {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
    cwd: ROOT, stdio: 'ignore', shell: true,
  });
  return result.status === 0;
}

function publish() {
  if (!run('npm', ['run', 'update'])) {
    log('✖ Сборка не удалась. Повторю после следующих изменений.');
    return false;
  }

  if (!run('git', ['add', '-A'])) return false;

  const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT, shell: true });
  if (diff.status === 0) {
    log('Изменений для коммита нет.');
    return true;
  }

  const message = `sync: ${new Date().toLocaleString('ru-RU')}`;
  if (!run('git', ['commit', '-m', message])) return false;

  if (!hasRemote()) {
    log('⚠ origin не настроен — коммит остался локально.');
    return true;
  }

  if (!hasUpstream()) {
    return run('git', ['push', '-u', 'origin', 'HEAD']);
  }
  if (!run('git', ['pull', '--rebase'])) return false;
  return run('git', ['push', 'origin', 'HEAD']);
}

if (process.argv.includes('--once')) {
  console.log(signature());
  process.exit(0);
}

log(`Наблюдаю за папкой: ${vault}`);
log(`Интервал проверки: ${INTERVAL} мс. Для выхода — Ctrl+C.`);

let last = signature();
let stable = 0;
let busy = false;

setInterval(() => {
  if (busy) return;

  let current;
  try {
    current = signature();
  } catch (error) {
    log(`⚠ Ошибка проверки: ${error.message}`);
    return;
  }

  if (current === last) {
    stable = 0;
    return;
  }

  last = current;
  stable += 1;
  if (stable < 2) return; // Ждём, пока файл допишется.

  stable = 0;
  busy = true;
  log('Обнаружены изменения — синхронизирую и публикую.');
  try {
    publish();
  } catch (error) {
    log(`✖ ${error.message}`);
  } finally {
    busy = false;
    log('Наблюдение продолжено.');
  }
}, INTERVAL);
