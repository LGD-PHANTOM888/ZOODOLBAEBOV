// Единый источник публикации: весь сайт лежит в одном R2-бакете.
// В бакет загружается содержимое dist/ с префиксом BASE_PATH, поэтому
// относительные ссылки Obsidian и адреса на сайте совпадают один в один.

const TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
  canvas: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
  pdf: 'application/pdf', bat: 'application/octet-stream',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
};

const MEDIA = /\.(mp4|mov|m4v|webm|mp3|wav|m4a|ogg)$/i;

function contentType(key) {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return TYPES[ext] || 'application/octet-stream';
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!match) return null;
  if (!match[1] && !match[2]) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix || suffix > size) return { invalid: true };
    return { start: Math.max(0, size - suffix), end: size - 1, suffix };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) return { invalid: true };
  return { start, end };
}

function cacheControl(key) {
  if (key.includes('/_astro/') || /\.[0-9a-f]{8,}\./.test(key)) return 'public, max-age=31536000, immutable';
  if (key.endsWith('.html') || key.endsWith('.json')) return 'no-cache';
  return 'public, max-age=86400';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = env.BASE_PATH || '/';

    if (base !== '/' && (url.pathname === '/' || url.pathname === base.replace(/\/$/, ''))) {
      return Response.redirect(new URL(base, url), 308);
    }

    let key;
    try {
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    } catch (_) {
      return new Response('Bad request', { status: 400 });
    }
    if (!key || key.split('/').includes('..')) return new Response('Forbidden', { status: 403 });

    // Прямое открытие ссылки на видео не отдаём: только встроенный плеер на холсте.
    if (MEDIA.test(key) && request.headers.get('Sec-Fetch-Dest') === 'document') {
      return new Response('Скачивание авторского контента недоступно', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    const options = {};
    const rangeHeader = request.headers.get('Range');
    let range = null;
    if (rangeHeader && MEDIA.test(key)) {
      const head = await env.ASSETS.get(key, { onlyHeaders: true });
      if (head) {
        range = parseRange(rangeHeader, head.size);
        if (range?.invalid) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${head.size}`, 'Accept-Ranges': 'bytes' },
          });
        }
        if (range) {
          options.range = range.suffix !== undefined
            ? { suffix: range.suffix }
            : { offset: range.start, length: range.end - range.start + 1 };
        }
      }
    }

    let object = await env.ASSETS.get(key, options);
    if (!object && !key.endsWith('/')) object = await env.ASSETS.get(`${key}/index.html`, options);
    if (!object && !key.includes('.')) object = await env.ASSETS.get(`${key}.html`, options);

    const prefix = base === '/' ? '' : base.replace(/^\/+|\/+$/g, '');
    if (!object) {
      const fallbackKey = prefix ? `${prefix}/404.html` : '404.html';
      object = await env.ASSETS.get(fallbackKey);
      if (!object) return new Response('Not found', { status: 404 });
      return new Response(object.body, {
        status: 404,
        headers: {
          'Content-Type': contentType(fallbackKey),
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const headers = new Headers({
      'Content-Type': contentType(key),
      'Cache-Control': cacheControl(key),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    });
    let status = 200;
    if (range && object.range) {
      status = 206;
      headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    }
    if (object.httpEtag) headers.set('ETag', object.httpEtag);

    return new Response(object.body, { status, headers });
  },
};
