import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'sync.config.json');
const NOTES_DIR = path.join(ROOT, 'src/content/notes');
const MEDIA_DIR = path.join(ROOT, 'public/media');
const DATA_DIR = path.join(ROOT, 'src/data');

const MEDIA_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif',
  '.mp4', '.mov', '.m4v', '.webm', '.mp3', '.wav',
  '.pdf', '.canvas', '.excalidraw',
]);

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

function isExcluded(rel, exclude, includeSensitive) {
  if (includeSensitive) return false;
  const parts = rel.split('/');
  return exclude.some((rule) => {
    const clean = rule.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!clean) return false;
    if (rule.endsWith('/')) return parts.some((part) => part.toLowerCase() === clean);
    return parts.some((part) => part.toLowerCase() === clean) || rel.toLowerCase().includes(clean);
  });
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
    if (entry.name.startsWith('.') && entry.name !== '.obsidian') continue;
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

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  const vault = path.resolve(ROOT, config.vault);
  const exclude = config.exclude || [];
  const includeSensitive = Boolean(config.includeSensitive);

  console.log('┌─ Obsidian → Astro ─────────────────────────────');
  console.log(`│ Vault: ${vault}`);

  await fs.rm(NOTES_DIR, { recursive: true, force: true });
  await fs.rm(MEDIA_DIR, { recursive: true, force: true });
  await fs.mkdir(NOTES_DIR, { recursive: true });
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  const allFiles = await walk(vault);
  const skipped = [];
  const kept = allFiles.filter(({ rel }) => {
    if (isExcluded(rel, exclude, includeSensitive)) {
      skipped.push(rel);
      return false;
    }
    return true;
  });

  // --- Медиа ---
  const mediaByBasename = new Map();
  const mediaByPath = new Map();
  let mediaCount = 0;

  for (const { full, rel } of kept) {
    const ext = path.extname(rel).toLowerCase();
    if (!MEDIA_EXT.has(ext)) continue;
    const basename = path.basename(rel);
    const destName = `${hash(rel).slice(0, 10)}-${slugify(path.basename(rel, ext))}${ext}`;
    await fs.copyFile(full, path.join(MEDIA_DIR, destName));
    const url = `/media/${encodeURIComponent(destName)}`;
    mediaByBasename.set(basename.toLowerCase(), url);
    mediaByPath.set(rel.toLowerCase(), url);
    mediaCount++;
  }

  // --- Первый проход: собираем заголовки и slug'ы ---
  const drafts = [];
  for (const { full, rel } of kept) {
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
      updated: attrs.updated || attrs.date || stats.mtime.toISOString().slice(0, 10),
    });
  }

  const draftByRel = new Map(drafts.map((draft) => [draft.rel.toLowerCase(), draft]));
  const draftBySlug = new Map(drafts.map((draft) => [draft.slug, draft]));
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

  // --- Холсты: превращаем JSON Obsidian в данные для просмотра ---
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
          url: `/notes/${noteSlug}/`,
          preview: stripMarkdown(target?.body).slice(0, 360),
        };
      }

      const media = mediaByPath.get(clean) || mediaByBasename.get(path.posix.basename(clean));
      if (media) {
        return { kind: mediaKind(ext), title: basename, url: media, preview: '' };
      }

      const originalRel = String(fileValue).replace(/\\/g, '/').replace(/^Public\//i, '');
      if (isExcluded(originalRel, exclude, includeSensitive)) {
        return { kind: 'locked', title: basename, url: null, preview: 'Исключено из публикации' };
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
        return { ...base, kind: 'text', title: 'Текст', text: String(node.text || ''), preview: '', url: null };
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
        locked: nodes.filter((node) => node.kind === 'locked').length,
      },
    };

    draft.descriptionOverride = `Холст · ${nodes.length} узлов · ${edges.length} связей`;
    for (const node of nodes) {
      if (node.kind === 'note' && !draft.canvasOutgoing.includes(node.slug)) {
        draft.canvasOutgoing.push(node.slug);
      }
    }
  }

  // --- Второй проход: конвертируем ссылки и записываем файлы ---
  const notes = [];
  for (const draft of drafts) {
    const outgoing = new Set(draft.canvasOutgoing);
    let body = draft.body;

    const resolveMedia = (target) => {
      const clean = target.trim().replace(/^\.\//, '').toLowerCase();
      if (mediaByPath.has(clean)) return mediaByPath.get(clean);
      const base = path.posix.basename(decodeURIComponent(clean));
      return mediaByBasename.get(base) || mediaByBasename.get(clean) || null;
    };

    // ![[embedded.png]] -> markdown image
    body = body.replace(/!\[\[([^\]]+)\]\]/g, (match, target) => {
      const media = resolveMedia(target);
      if (media) return `![${path.posix.basename(target)}](${media})`;
      const slug = resolveNoteTarget(target);
      if (slug) { outgoing.add(slug); return `[📎 ${target}](/notes/${slug}/)`; }
      return match;
    });

    // [[Заметка|Подпись]] и [[Заметка#Заголовок]]
    body = body.replace(/(!?)\[\[([^\]]+)\]\]/g, (match, bang, inner) => {
      const [target, alias] = inner.split('|');
      const slug = resolveNoteTarget(target);
      if (!slug) return match;
      outgoing.add(slug);
      const anchor = target.includes('#') ? `#${slugify(target.split('#')[1])}` : '';
      return `[${alias || target.trim().split('#')[0]}](/notes/${slug}/${anchor})`;
    });

    // Обычные markdown-картинки с относительными путями
    body = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, target) => {
      if (/^(https?:|data:|#|\/media\/)/i.test(target)) return match;
      const media = resolveMedia(target);
      return media ? `![${alt}](${media})` : match;
    });

    // Markdown-ссылки на другие .md файлы
    body = body.replace(/\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/gi, (match, label, target) => {
      const slug = resolveNoteTarget(decodeURIComponent(target.split('#')[0]));
      if (!slug) return match;
      outgoing.add(slug);
      const anchor = target.includes('#') ? `#${slugify(target.split('#')[1])}` : '';
      return `[${label}](/notes/${slug}/${anchor})`;
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

  // --- Папки для Explorer и графов по разделам ---
  const folderSet = new Set();
  for (const note of notes) {
    if (!note.folder) continue;
    const parts = note.folder.split('/');
    for (let i = 1; i <= parts.length; i++) folderSet.add(parts.slice(0, i).join('/'));
  }
  const folders = [...folderSet]
    .map((folder) => ({
      path: folder,
      segments: folder.split('/'),
      count: notes.filter((note) => note.folder === folder || note.folder.startsWith(`${folder}/`)).length,
      direct: notes.filter((note) => note.folder === folder).length,
    }))
    .sort((a, b) => a.path.localeCompare(b.path, 'ru'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    siteTitle: config.siteTitle || 'Мой сад',
    siteDescription: config.siteDescription || '',
    notes: notes.sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
    backlinks,
    canvases,
    folders,
  };
  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`│ Заметок: ${notes.length}, холстов: ${Object.keys(canvases).length}, медиа: ${mediaCount}`);
  if (skipped.length) console.log(`│ Пропущено (личное/служебное): ${skipped.length}`);
  console.log('└────────────────────────────────────────────────');
  if (skipped.length) {
    console.log('Примеры пропущенного:');
    skipped.slice(0, 10).forEach((item) => console.log('  • ' + item));
  }
}

main().catch((error) => {
  console.error('Ошибка синхронизации:', error);
  process.exit(1);
});
