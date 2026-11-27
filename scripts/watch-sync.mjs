import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { publishAll } from './publish.mjs';

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
          // Холсты помечаем явно: появление/удаление .canvas должно менять
          // подпись даже если размер и время файла совпадают.
          const kind = path.extname(entry.name).toLowerCase() === '.canvas' ? 'CANVAS' : 'FILE';
          entries.push(`${kind}|${relPath}|${stat.size}|${Math.floor(stat.mtimeMs)}`);
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

// Явная проверка наличия холстов при каждом тике наблюдателя.
function canvasList() {
  const found = [];

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
        walk(full, relPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.canvas') {
        found.push(relPath);
      }
    }
  }

  walk(vault);
  return found.sort();
}

const canvasSummary = (list) => list.length
  ? `Холстов: ${list.length}`
  : 'Холстов нет — в Public не найдено ни одного .canvas';

function run(command, args) {
  log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: true });
  return result.status === 0;
}

function publish() {
  if (!run('npm', ['run', 'update'])) {
    log('✖ Сборка не удалась. Повторю после следующих изменений.');
    return false;
  }

  // Один вызов обновляет все медиа-репозитории и основной сайт.
  if (!publishAll()) {
    log('✖ Публикация не удалась. Исправьте ошибку и измените файл в Public ещё раз.');
    return false;
  }
  return true;
}

if (process.argv.includes('--once')) {
  console.log(canvasSummary(canvasList()));
  console.log(signature());
  process.exit(0);
}

log(`Наблюдаю за папкой: ${vault}`);
log(`Интервал проверки: ${INTERVAL} мс. Для выхода — Ctrl+C.`);

let last = signature();
let lastCanvases = canvasList();
log(canvasSummary(lastCanvases));
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

  const canvases = canvasList();
  if (canvases.join('\n') !== lastCanvases.join('\n')) {
    log(canvasSummary(canvases));
    lastCanvases = canvases;
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
