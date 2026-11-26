import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'sync.config.json'), 'utf8'));

const stamp = () => new Date().toLocaleString('ru-RU');
const log = (message) => console.log(`[${stamp()}] ${message}`);

function run(command, args, cwd = ROOT) {
  log(`> [${path.basename(cwd)}] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true });
  if (result.error) {
    log(`✖ ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

function gitOk(args, cwd) {
  return spawnSync('git', args, { cwd, stdio: 'ignore', shell: true }).status === 0;
}

function hasRemote(cwd) {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd, encoding: 'utf8', shell: true,
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function hasUpstream(cwd) {
  return gitOk(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
}

function remoteHasHead(cwd) {
  const result = spawnSync('git', ['ls-remote', '--exit-code', 'origin', 'HEAD'], {
    cwd, encoding: 'utf8', shell: true, timeout: 30000,
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function hasPendingCommits(cwd) {
  if (!hasUpstream(cwd)) return true;
  const result = spawnSync('git', ['rev-list', '--count', '@{u}..HEAD'], {
    cwd, encoding: 'utf8', shell: true,
  });
  return result.status === 0 && Number(result.stdout.trim()) > 0;
}

function publishRepo(cwd, label, message) {
  if (!gitOk(['rev-parse', '--is-inside-work-tree'], cwd)) {
    log(`✖ ${label}: не git-репозиторий. Сначала выполните npm run setup:media.`);
    return false;
  }
  if (!hasRemote(cwd)) {
    log(`✖ ${label}: нет origin. Сначала выполните npm run setup:media.`);
    return false;
  }

  if (!run('git', ['add', '-A'], cwd)) return false;

  const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd, shell: true });
  let committed = false;
  if (diff.status === 0) {
    log(`${label}: новых изменений в индексе нет, проверяю неотправленные коммиты.`);
  } else if (diff.status === 1) {
    if (!run('git', ['commit', '-m', message], cwd)) return false;
    committed = true;
  } else {
    log(`✖ ${label}: не удалось проверить изменения в индексе.`);
    return false;
  }

  if (!committed && !hasPendingCommits(cwd)) {
    log(`${label}: неотправленных коммитов нет.`);
    return true;
  }

  if (!hasUpstream(cwd)) {
    // Пустой репозиторий пушится сразу. Если там уже есть коммиты (например,
    // GitHub создал README), сначала подтягиваем историю.
    if (remoteHasHead(cwd) && !run('git', ['pull', '--rebase', 'origin', 'HEAD'], cwd)) return false;
    return run('git', ['push', '-u', 'origin', 'HEAD'], cwd);
  }

  if (!run('git', ['pull', '--rebase'], cwd)) return false;
  return run('git', ['push', 'origin', 'HEAD'], cwd);
}

/**
 * Публикует все медиа-репозитории, затем основной сайт.
 * Порядок важен: сначала должны появиться файлы, на которые ссылается сайт.
 */
export function publishAll() {
  const message = `sync: ${new Date().toISOString()}`;
  const sites = Object.entries(config.mediaSites || {});

  for (const [name, site] of sites) {
    if (!site?.dir || !site?.repo) continue;
    const dir = path.resolve(ROOT, site.dir);
    if (!fs.existsSync(dir)) {
      log(`✖ Медиа-репозиторий ${name} не найден: ${dir}. Выполните npm run setup:media.`);
      return false;
    }
    if (!publishRepo(dir, `${name} (${site.repo})`, message)) return false;
  }

  return publishRepo(ROOT, `site (${config.siteTitle || 'site'})`, message);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  process.exit(publishAll() ? 0 : 1);
}
