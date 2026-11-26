import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'sync.config.json');
const NOTES_DIR = path.join(ROOT, 'src/content/notes');
const NEWS_DIR = path.join(ROOT, 'src/content/news');
const UPDATES_DIR = path.join(ROOT, 'src/content/updates');
const MIRROR_DIR = path.join(ROOT, 'public/vault');
const DATA_DIR = path.join(ROOT, 'src/data');

const NOTE_EXT = new Set(['.md', '.canvas']);

const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const translit = (value) => [...value].map((char) => CYR[char.toLowerCase()] ?? char).join('');

function slugify(value) {
  const result = translit(value)
    .toLowerCase()
    .replace(/[<>:"/\\|?*'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
  return result || 'note';
}

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex');
const toPosix = (value) => value.split(path.sep).join('/');

// GitHub Pages project pages живут под /<repo>/. Manifest используют и шаблоны,
// и прямой JS, поэтому базу нужно добавлять здесь, а не только в rehype-плагине.
function repoFromOrigin() {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    return match ? `${match[1]}/${match[2]}` : '';
  } catch {
    return '';
  }
}

function siteBase() {
  // Локальный наблюдатель и Actions должны получать одну и ту же базу,
  // иначе сгенерированные manifest.json и dist разойдутся.
  const repo = process.env.GITHUB_REPOSITORY || repoFromOrigin();
  const [owner = '', name = ''] = repo.split('/');
  const isUserPage = name.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  const base = process.env.SITE_BASE || (repo && !isUserPage ? `/${name}/` : '/');
  return base.endsWith('/') ? base : `${base}/`;
}

const BASE = siteBase();
const withBase = (url) => (url.startsWith('/') ? `${BASE}${url.slice(1)}` : url);

const encodedRel = (rel) => toPosix(rel).split('/').map(encodeURIComponent).join('/');

// Репозиторий выбирается по самому длинному префиксу пути: конкретный человек
// перекрывает страну. Obsidian при этом остаётся одной папкой, делится только
// публикация.
function mediaSiteFor(rel, config = {}) {
  const clean = toPosix(rel).replace(/\/+$/, '').toLowerCase();
  let best = null;
  for (const [name, site] of Object.entries(config.mediaSites || {})) {
    if (!site?.repo || !site?.dir) continue;
    const prefix = toPosix(name).replace(/\/+$/, '').toLowerCase();
    if (clean !== prefix && !clean.startsWith(`${prefix}/`)) continue;
    if (!best || prefix.length > best.prefix.length) best = { name, site, prefix };
  }
  return best;
}

function mirrorUrl(rel, config = {}) {
  const match = mediaSiteFor(rel, config);
  if (match) {
    const owner = String(config.owner || 'LGD-PHANTOM888').toLowerCase();
    return `https://${owner}.github.io/${match.site.repo}/vault/${encodedRel(rel)}`;
  }
  return `${BASE}vault/${encodedRel(rel)}`;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { attrs: {}, body: raw };
  const lines = raw.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { attrs: {}, body: raw };

  const attrs = {};
  let currentKey = null;
  for (const line of lines.slice(1, end)) {
    const arrayItem = /^\s*-\s+(.*)$/.exec(line);
    if (arrayItem && currentKey) {
      attrs[currentKey] = [...(Array.isArray(attrs[currentKey]) ? attrs[currentKey] : []), arrayItem[1].replace(/^["']|["']$/g, '')];
      continue;
    }
    const pair = /^([^:]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    currentKey = pair[1].trim();
    let value = pair[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, '');
    }
    attrs[currentKey] = value;
  }
  return { attrs, body: lines.slice(end + 1).join('\n').replace(/^\n+/, '') };
}

function normalizeTag(tag) {
  return String(tag).replace(/^#/, '').replace(/[^\p{L}\p{N}_/-]/gu, '').toLowerCase();
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/!\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textTitle(value) {
  const firstLine = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return 'Пустой текст';
  return firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine;
}

function normalizeColor(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return /^(#|rgb|hsl)/i.test(value) ? value : null;
  }
  if (typeof value === 'object' && value.r !== undefined) {
    return `#${[value.r, value.g, value.b]
      .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return null;
}

function mediaKind(ext) {
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav'].includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  return 'other';
}

async function walk(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${toPosix(entry.name)}` : toPosix(entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full, rel));
    } else if (entry.isFile()) {
      files.push({ full, rel });
    }
  }
  return files;
}

// Empty folders must also reach the tree: the batch should pick up the Obsidian
// structure even before the first file appears inside a new folder.
async function walkDirs(dir, base = '') {
  const found = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rel = base ? `${base}/${toPosix(entry.name)}` : toPosix(entry.name);
    found.push(rel);
    found.push(...await walkDirs(path.join(dir, entry.name), rel));
  }
  return found;
}

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  const vault = path.resolve(ROOT, config.vault);
  const mediaSites = config.mediaSites || {};
  const newsFolder = toPosix(String(config.newsFolder || 'Новинки'));
  const updatesFile = toPosix(String(config.updatesFile || 'Обновления.md'));
  const newsItems = [];

  console.log('┌─ Public → Astro ───────────────────────────────');
  console.log(`│ Source: ${vault}`);

  await fs.rm(NOTES_DIR, { recursive: true, force: true });
  await fs.rm(NEWS_DIR, { recursive: true, force: true });
  await fs.rm(UPDATES_DIR, { recursive: true, force: true });
  await fs.rm(MIRROR_DIR, { recursive: true, force: true });
  await fs.mkdir(NOTES_DIR, { recursive: true });
  await fs.mkdir(NEWS_DIR, { recursive: true });
  await fs.mkdir(UPDATES_DIR, { recursive: true });
  await fs.mkdir(MIRROR_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  // Каждая страна — отдельный статический сайт. Папки очищаются целиком, поэтому
  // удалённые в Obsidian файлы исчезают и из всех репозиториев.
  const mediaDirs = new Map();
  for (const [name, site] of Object.entries(mediaSites)) {
    if (!site?.dir || !site?.repo) continue;
    const dir = path.resolve(ROOT, site.dir);
    if (dir === ROOT || dir === vault || dir.startsWith(`${vault}${path.sep}`)) {
      throw new Error(`Небезопасный mediaSites.${name}.dir: ${dir}`);
    }
    await fs.rm(path.join(dir, 'vault'), { recursive: true, force: true });
    await fs.mkdir(path.join(dir, 'vault'), { recursive: true });
    await fs.appendFile(path.join(dir, '.nojekyll'), '', 'utf8');
    mediaDirs.set(name, path.join(dir, 'vault'));
    console.log(`│ Media: ${name} → ${site.repo} (${dir})`);
  }

  const allFiles = await walk(vault);
  const allDirs = await walkDirs(vault);

  // --- Зеркало Public: исходные имена, папки и вложения ---
  // Папки стран уходят в свои репозитории, остальное остаётся на основном сайте.
  const mediaByBasename = new Map();
  const mediaByPath = new Map();
  let mediaCount = 0;

  for (const { full, rel } of allFiles) {
    const match = mediaSiteFor(rel, config);
    const root = match ? mediaDirs.get(match.name) : MIRROR_DIR;
    const dest = path.join(root, ...rel.split('/'));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(full, dest);

    const ext = path.extname(rel).toLowerCase();
    if (NOTE_EXT.has(ext)) continue;
    const url = mirrorUrl(rel, config);
    mediaByBasename.set(path.basename(rel).toLowerCase(), url);
    mediaByPath.set(rel.toLowerCase(), url);
    mediaCount++;
  }

  // --- Первый проход: собираем заголовки и slug'ы ---
  const drafts = [];
  for (const { full, rel } of allFiles) {
    const ext = path.extname(rel).toLowerCase();
    if (ext !== '.md' && ext !== '.canvas') continue;

    const raw = await fs.readFile(full, 'utf8');
    let attrs = {};
    let body = '';
    let canvasData = null;

    if (ext === '.md') {
      ({ attrs, body } = parseFrontmatter(raw));
    } else {
      try {
        canvasData = JSON.parse(raw);
      } catch (error) {
        console.warn(`│ ⚠ Не удалось прочитать холст ${rel}: ${error.message}`);
        canvasData = { nodes: [], edges: [] };
      }
    }

    const filename = path.basename(rel, ext);
    const title = String(attrs.title || (/^#{1,3}\s+(.+)$/m.exec(body)?.[1] || filename)).trim();
    const slug = `${slugify(rel.replace(/\.[^.]+$/, ''))}-${hash(rel).slice(0, 6)}`;
    const folder = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    const stats = await fs.stat(full);

    drafts.push({
      rel, ext, title, slug, folder, attrs, body, canvasData,
      descriptionOverride: null,
      canvasOutgoing: [],
      updated: attrs.updated || attrs.date || stats.mtime.toISOString(),
    });
  }

  const draftByRel = new Map(drafts.map((draft) => [draft.rel.toLowerCase(), draft]));
  const draftBySlug = new Map(drafts.map((draft) => [draft.slug, draft]));

  // Отдельные страницы есть только у холстов. Обычные записи остаются внутри холстов.
  const internalLink = (slug, label, anchor = '') => {
    const target = draftBySlug.get(slug);
    if (!target || target.ext !== '.canvas') return label;
    return `[${label}](/canvases/${slug}/${anchor})`;
  };
  const slugByTitle = new Map();
  const slugByPath = new Map();
  for (const note of drafts) {
    slugByTitle.set(note.title.toLowerCase(), note.slug);
    slugByTitle.set(path.basename(note.rel).replace(/\.[^.]+$/, '').toLowerCase(), note.slug);
    slugByPath.set(note.rel.toLowerCase(), note.slug);
  }

  const resolveNoteTarget = (target) => {
    if (!target) return null;
    const clean = decodeURIComponent(String(target).replace(/\\/g, '/'))
      .replace(/^\.?\//, '')
      .replace(/^Public\//i, '')
      .split('#')[0]
      .trim()
      .toLowerCase();
    if (!clean) return null;
    if (slugByPath.has(clean)) return slugByPath.get(clean);
    if (slugByPath.has(`${clean}.md`)) return slugByPath.get(`${clean}.md`);
    return slugByTitle.get(clean) || null;
  };

  // --- Холсты: превращаем JSON в данные для просмотра ---
  const canvases = {};
  for (const draft of drafts.filter((item) => item.ext === '.canvas')) {
    const data = draft.canvasData || { nodes: [], edges: [] };
    const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
    const rawEdges = Array.isArray(data.edges) ? data.edges : [];

    const resolveCanvasTarget = (fileValue) => {
      const basename = path.posix.basename(decodeURIComponent(String(fileValue).replace(/\\/g, '/')));
      const clean = decodeURIComponent(String(fileValue).replace(/\\/g, '/'))
        .replace(/^\.?\//, '')
        .replace(/^Public\//i, '')
        .split('#')[0]
        .trim()
        .toLowerCase();
      const ext = path.posix.extname(clean).toLowerCase();

      const noteSlug = resolveNoteTarget(clean);
      if (noteSlug) {
        const target = draftBySlug.get(noteSlug);
        return {
          kind: 'note',
          title: target?.title || basename,
          slug: noteSlug,
          url: target?.ext === '.canvas' ? withBase(`/canvases/${noteSlug}/`) : null,
          preview: stripMarkdown(target?.body).slice(0, 360),
          search: stripMarkdown(target?.body).slice(0, 1200),
        };
      }

      const media = mediaByPath.get(clean) || mediaByBasename.get(path.posix.basename(clean));
      if (media) {
        return { kind: mediaKind(ext), title: basename, url: media, preview: '' };
      }

      return { kind: 'missing', title: basename, url: null, preview: 'Файл не найден при синхронизации' };
    };

    const nodes = rawNodes.map((node) => {
      const base = {
        id: String(node.id || ''),
        type: String(node.type || 'file'),
        x: Number(node.x) || 0,
        y: Number(node.y) || 0,
        width: Number(node.width) || 260,
        height: Number(node.height) || 160,
        color: normalizeColor(node.color),
      };

      if (base.type === 'text') {
        const text = String(node.text || '');
        return { ...base, kind: 'text', title: textTitle(text), text, preview: '', url: null };
      }
      if (base.type === 'link') {
        return { ...base, kind: 'link', title: String(node.label || node.url || 'Ссылка'), text: '', preview: String(node.url || ''), url: String(node.url || '') };
      }
      if (base.type === 'group') {
        return { ...base, kind: 'group', title: String(node.label || 'Группа'), text: '', preview: '', url: null };
      }
      const resolved = resolveCanvasTarget(node.file || '');
      return { ...base, ...resolved, text: '' };
    }).filter((node) => node.id);

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = rawEdges
      .filter((edge) => nodeIds.has(String(edge.fromNode)) && nodeIds.has(String(edge.toNode)))
      .map((edge) => ({
        id: String(edge.id || `${edge.fromNode}-${edge.toNode}`),
        from: String(edge.fromNode),
        to: String(edge.toNode),
        fromSide: String(edge.fromSide || 'right'),
        toSide: String(edge.toSide || 'left'),
      }));

    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const right = nodes.map((node) => node.x + node.width);
    const bottom = nodes.map((node) => node.y + node.height);
    const bounds = {
      x: xs.length ? Math.min(...xs) - 120 : -600,
      y: ys.length ? Math.min(...ys) - 120 : -400,
      width: xs.length ? Math.max(...right) - Math.min(...xs) + 240 : 1200,
      height: ys.length ? Math.max(...bottom) - Math.min(...ys) + 240 : 800,
    };

    canvases[draft.slug] = {
      slug: draft.slug,
      title: draft.title,
      folder: draft.folder,
      nodes,
      edges,
      bounds,
      stats: {
        nodes: nodes.length,
        edges: edges.length,
        notes: nodes.filter((node) => node.kind === 'note').length,
        media: nodes.filter((node) => ['image', 'video', 'audio', 'pdf'].includes(node.kind)).length,
      },
    };

    draft.descriptionOverride = `Холст · ${nodes.length} узлов · ${edges.length} связей`;
    for (const node of nodes) {
      if (node.kind === 'note' && !draft.canvasOutgoing.includes(node.slug)) {
        draft.canvasOutgoing.push(node.slug);
      }
    }
  }

  // --- Связи между холстами через общие вложенные записи ---
  const canvasLinks = new Map(Object.keys(canvases).map((slug) => [slug, new Set()]));
  const noteToCanvases = new Map();
  for (const draft of drafts.filter((item) => item.ext === '.canvas')) {
    for (const target of draft.canvasOutgoing) {
      if (!noteToCanvases.has(target)) noteToCanvases.set(target, []);
      noteToCanvases.get(target).push(draft.slug);
    }
  }
  for (const slugs of noteToCanvases.values()) {
    for (let i = 0; i < slugs.length; i++) {
      for (let j = i + 1; j < slugs.length; j++) {
        if (slugs[i] === slugs[j]) continue;
        canvasLinks.get(slugs[i])?.add(slugs[j]);
        canvasLinks.get(slugs[j])?.add(slugs[i]);
      }
    }
  }

  // --- Второй проход: конвертируем ссылки и записываем файлы ---
  const notes = [];
  for (const draft of drafts) {
    const outgoing = new Set(
      draft.ext === '.canvas' ? (canvasLinks.get(draft.slug) || []) : draft.canvasOutgoing
    );
    let body = draft.body;

    const resolveMedia = (target) => {
      const clean = target.trim().replace(/^\.\//, '').toLowerCase();
      if (mediaByPath.has(clean)) return mediaByPath.get(clean);
      const base = path.posix.basename(decodeURIComponent(clean));
      return mediaByBasename.get(base) || mediaByBasename.get(clean) || null;
    };

    // Видео должно остаться видео: тогда общий мини-плеер сможет его улучшить.
    const mediaTag = (target, url) => {
      const ext = path.posix.extname(decodeURIComponent(target).split('?')[0].split('#')[0]).toLowerCase();
      if (['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) {
        return `<video controls preload="none" src="${url}"></video>`;
      }
      if (['.mp3', '.wav'].includes(ext)) {
        return `<audio controls preload="none" src="${url}"></audio>`;
      }
      return `![${path.posix.basename(target)}](${url})`;
    };

    // ![[embedded.png]] -> markdown image (или video/audio)
    body = body.replace(/!\[\[([^\]]+)\]\]/g, (match, target) => {
      const media = resolveMedia(target);
      if (media) return mediaTag(target, media);
      const slug = resolveNoteTarget(target);
      if (slug) { outgoing.add(slug); return internalLink(slug, target); }
      return match;
    });

    // [[Заметка|Подпись]] и [[Заметка#Заголовок]]
    body = body.replace(/(!?)\[\[([^\]]+)\]\]/g, (match, bang, inner) => {
      const [target, alias] = inner.split('|');
      const slug = resolveNoteTarget(target);
      if (!slug) return match;
      outgoing.add(slug);
      const anchor = target.includes('#') ? `#${slugify(target.split('#')[1])}` : '';
      return internalLink(slug, alias || target.trim().split('#')[0], anchor);
    });

    // Обычные markdown-картинки с относительными путями
    body = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, target) => {
      if (/^(https?:|data:|#|\/media\/)/i.test(target)) return match;
      const media = resolveMedia(target);
      return media ? mediaTag(target, media) : match;
    });

    // Markdown-ссылки на другие .md файлы
    body = body.replace(/\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/gi, (match, label, target) => {
      const slug = resolveNoteTarget(decodeURIComponent(target.split('#')[0]));
      if (!slug) return match;
      outgoing.add(slug);
      const anchor = target.includes('#') ? `#${slugify(target.split('#')[1])}` : '';
      return internalLink(slug, label, anchor);
    });

    const frontmatterTags = Array.isArray(draft.attrs.tags)
      ? draft.attrs.tags
      : String(draft.attrs.tags || '').split(/[\s,]+/).filter(Boolean);
    const inlineTags = [...body.matchAll(/(?<![#\w])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)].map((m) => m[1]);
    const tags = [...new Set([...frontmatterTags, ...inlineTags].map(normalizeTag).filter(Boolean))];

    const description = draft.descriptionOverride || stripMarkdown(
      body.replace(/^#{1,6}.*$/gm, '').replace(/^\s*>.*$/gm, '').split(/\n\s*\n/).find((p) => p.trim()) || ''
    ).slice(0, 180);
    const words = body.replace(/[#*>`_\[\]()!]/g, '').split(/\s+/).filter(Boolean).length;
    const kind = draft.ext === '.canvas' ? 'canvas' : 'note';
    const relPosix = toPosix(draft.rel);
    const isNews = draft.ext === '.md' && (relPosix === newsFolder || relPosix.startsWith(`${newsFolder}/`));

    // Новинки — только текстовые файлы. Вложения остаются в том же репозитории,
    // но отдельными постами не становятся: они подключаются внутри записи.
    if (isNews) {
      const newsYaml = [
        '---',
        `title: ${JSON.stringify(draft.title)}`,
        `slug: ${JSON.stringify(draft.slug)}`,
        `description: ${JSON.stringify(description)}`,
        `updated: ${JSON.stringify(draft.updated)}`,
        `source: ${JSON.stringify(draft.rel)}`,
        '---',
        '',
      ].join('\n');
      await fs.writeFile(path.join(NEWS_DIR, `${draft.slug}.md`), newsYaml + body + '\n', 'utf8');
      newsItems.push({
        slug: draft.slug,
        title: draft.title,
        description,
        updated: draft.updated,
        source: draft.rel,
      });
      continue;
    }

    // Один файл обновлений показывается по кнопке в шапке.
    if (draft.ext === '.md' && relPosix === updatesFile) {
      const updatesYaml = [
        '---',
        `title: ${JSON.stringify(draft.title || 'Последние обновления')}`,
        `updated: ${JSON.stringify(draft.updated)}`,
        `source: ${JSON.stringify(draft.rel)}`,
        '---',
        '',
      ].join('\n');
      await fs.writeFile(path.join(UPDATES_DIR, 'latest.md'), updatesYaml + body + '\n', 'utf8');
    }

    const yaml = [
      '---',
      `title: ${JSON.stringify(draft.title)}`,
      `slug: ${JSON.stringify(draft.slug)}`,
      `description: ${JSON.stringify(description)}`,
      `tags: ${JSON.stringify(tags)}`,
      `folder: ${JSON.stringify(draft.folder)}`,
      `updated: ${JSON.stringify(draft.updated)}`,
      `source: ${JSON.stringify(draft.rel)}`,
      `kind: ${JSON.stringify(kind)}`,
      '---',
      '',
    ].join('\n');

    await fs.writeFile(path.join(NOTES_DIR, `${draft.slug}.md`), yaml + body + '\n', 'utf8');

    notes.push({
      slug: draft.slug,
      title: draft.title,
      folder: draft.folder,
      kind,
      tags,
      description,
      updated: draft.updated,
      words,
      outgoing: [...outgoing],
    });
  }

  // --- Обратные ссылки ---
  const backlinks = {};
  for (const note of notes) backlinks[note.slug] = [];
  for (const note of notes) {
    for (const target of note.outgoing) {
      if (backlinks[target] && !backlinks[target].includes(note.slug)) {
        backlinks[target].push(note.slug);
      }
    }
  }

  // --- На сайте показываются только холсты ---
  const published = notes.filter((note) => note.kind === 'canvas');

  // --- Папки для Explorer и графов по разделам ---
  // All folders from Obsidian are included, not only folders with canvases, so
  // the tree and folder pages update on the next batch run.
  const folderSet = new Set(allDirs.map(toPosix));
  for (const note of notes) {
    if (!note.folder) continue;
    const parts = toPosix(note.folder).split('/');
    for (let i = 1; i <= parts.length; i++) folderSet.add(parts.slice(0, i).join('/'));
  }
  const folders = [...folderSet]
    .map((folder) => {
      const scoped = notes.filter((note) => note.folder === folder || note.folder.startsWith(`${folder}/`));
      const canvasesHere = scoped.filter((note) => note.kind === 'canvas');
      return {
        path: folder,
        segments: folder.split('/'),
        count: canvasesHere.length,
        direct: canvasesHere.filter((note) => note.folder === folder).length,
        files: scoped.length,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, 'ru'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    siteTitle: config.siteTitle || 'Холсты',
    siteDescription: config.siteDescription || '',
    notes: published.sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
    news: newsItems.sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
    newsRepo: mediaSites[newsFolder]?.repo || '',
    newsOwner: String(config.owner || 'LGD-PHANTOM888'),
    updatesFile,
    backlinks,
    canvases,
    folders,
  };
  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`│ Холстов: ${published.length}, новинок: ${newsItems.length}, файлов: ${notes.length}, вложений: ${mediaCount}`);
  console.log('└────────────────────────────────────────────────');
}

main().catch((error) => {
  console.error('Ошибка синхронизации:', error);
  process.exit(1);
});
