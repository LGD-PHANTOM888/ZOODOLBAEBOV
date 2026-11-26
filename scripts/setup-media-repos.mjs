import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'sync.config.json'), 'utf8'));
const owner = String(config.owner || 'LGD-PHANTOM888');

const log = (message) => console.log(message);

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: options.quiet ? 'ignore' : 'inherit',
    shell: true,
    env: options.env || process.env,
    timeout: options.timeout,
  });
  if (result.error) {
    log(`  ✖ ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

function isGitRepo(cwd) {
  return run('git', ['rev-parse', '--is-inside-work-tree'], cwd, { quiet: true });
}

function hasUpstream(cwd) {
  return run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd, { quiet: true });
}

function remoteHasHead(cwd) {
  const result = spawnSync('git', ['ls-remote', '--exit-code', 'origin', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    shell: true,
    timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function setup(name, site) {
  log(`\n=== ${name} → ${site.repo} ===`);

  const dir = path.resolve(ROOT, site.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, '.nojekyll'), '', 'utf8');

  if (!isGitRepo(dir)) {
    if (!run('git', ['init', '-b', 'main'], dir)) return false;
  } else {
    log('  git: уже инициализирован');
  }

  const url = `https://github.com/${owner}/${site.repo}.git`;
  if (!run('git', ['remote', 'add', 'origin', url], dir, { quiet: true })) {
    if (!run('git', ['remote', 'set-url', 'origin', url], dir)) return false;
  }

  // Проверяем, что репозиторий создан на GitHub. Пустой репозиторий тоже OK:
  // ls-remote завершается успешно, но ничего не возвращает.
  const check = spawnSync('git', ['ls-remote', 'origin'], {
    cwd: dir,
    encoding: 'utf8',
    shell: true,
    timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (check.status !== 0) {
    log(`  ✖ Не удалось получить доступ к ${url}`);
    log('    Создайте пустой публичный репозиторий на https://github.com/new без README/license/.gitignore.');
    return false;
  }

  if (!run('git', ['add', '-A'], dir)) return false;
  const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: dir, shell: true });
  if (diff.status === 1) {
    if (!run('git', ['commit', '-m', `setup: ${site.repo}`], dir)) return false;
  } else if (diff.status !== 0) {
    log('  ✖ Не удалось проверить изменения в индексе.');
    return false;
  }

  if (!hasUpstream(dir)) {
    if (remoteHasHead(dir) && !run('git', ['pull', '--rebase', 'origin', 'HEAD'], dir)) return false;
    return run('git', ['push', '-u', 'origin', 'HEAD'], dir);
  }
  if (!run('git', ['pull', '--rebase'], dir)) return false;
  return run('git', ['push', 'origin', 'HEAD'], dir);
}

function main() {
  const sites = Object.entries(config.mediaSites || {});
  if (!sites.length) {
    log('В sync.config.json нет mediaSites.');
    return false;
  }

  let ok = true;
  for (const [name, site] of sites) {
    if (!site?.dir || !site?.repo) continue;
    if (!setup(name, site)) ok = false;
  }

  log('');
  if (ok) {
    log('[OK] Медиа-репозитории готовы. Теперь npm run update и node scripts/publish.mjs.');
  } else {
    log('[FAIL] Часть репозиториев не настроена. Проверьте ошибки выше и повторите npm run setup:media.');
  }
  return ok;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  process.exit(main() ? 0 : 1);
}
