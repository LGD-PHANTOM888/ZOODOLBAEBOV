import { visit } from 'unist-util-visit';

/** Добавляет base ко всем внутренним абсолютным ссылкам (для GitLab project pages). */
export default function rehypeBase({ base = '/' } = {}) {
  const prefix = !base || base === '/' ? '' : (base.endsWith('/') ? base : `${base}/`);
  const attrs = {
    a: ['href'],
    img: ['src', 'srcset'],
    video: ['src', 'poster'],
    source: ['src', 'srcset'],
  };

  return (tree) => {
    visit(tree, 'element', (node) => {
      // Видео в Obsidian вставляется как ![[file.mp4]], после синха это <img>.
      if (node.tagName === 'img' && typeof node.properties?.src === 'string') {
        const src = node.properties.src.split(/[?#]/)[0].toLowerCase();
        if (/\.(mp4|mov|m4v|webm)$/.test(src)) {
          node.tagName = 'video';
          node.properties = {
            src: node.properties.src,
            controls: true,
            preload: 'metadata',
            playsInline: true,
          };
          return;
        }
      }

      const keys = attrs[node.tagName];
      if (!keys || !node.properties) return;
      for (const key of keys) {
        const value = node.properties[key];
        if (typeof value !== 'string') continue;
        if (!prefix || !value.startsWith('/') || value.startsWith('//')) continue;
        node.properties[key] = prefix + value.slice(1);
      }
    });
  };
}
