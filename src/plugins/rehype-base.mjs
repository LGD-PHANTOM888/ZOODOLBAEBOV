import { visit } from 'unist-util-visit';

/** Добавляет base ко всем внутренним абсолютным ссылкам (для project pages). */
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
      // Вложенное видео после синха превращается в <img>.
      if (node.tagName === 'img' && typeof node.properties?.src === 'string') {
        const src = node.properties.src.split(/[?#]/)[0].toLowerCase();
        if (/\.(mp4|mov|m4v|webm)$/.test(src)) {
          node.tagName = 'video';
          node.properties = {
            src: node.properties.src,
            controls: true,
            preload: 'none',
            playsInline: true,
            controlsList: 'nodownload',
            disablePictureInPicture: true,
            disableRemotePlayback: true,
            draggable: false,
          };
          return;
        }
      }

      const keys = attrs[node.tagName];
      if (!keys || !node.properties) return;
      // Медиа в записях и новинках не должны грузиться до появления на экране.
      if (node.tagName === 'img') {
        node.properties.loading ??= 'lazy';
        node.properties.decoding ??= 'async';
        node.properties.fetchPriority ??= 'low';
      }
      if (node.tagName === 'video') node.properties.preload ??= 'none';
      for (const key of keys) {
        const value = node.properties[key];
        if (typeof value !== 'string') continue;
        // manifest уже содержит базу — не добавляем её второй раз.
        if (!prefix || !value.startsWith('/') || value.startsWith('//') || value.startsWith(prefix)) continue;
        node.properties[key] = prefix + value.slice(1);
      }
    });
  };
}
