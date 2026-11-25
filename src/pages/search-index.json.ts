import type { APIRoute } from 'astro';
import manifest from '../data/manifest.json';

export const GET: APIRoute = () => {
  const canvases = Object.values(manifest.canvases as Record<string, any>);
  const contentBySlug = new Map(
    canvases.map((canvas) => [
      canvas.slug,
      (canvas.nodes || [])
        .flatMap((node: any) => [node.title, node.text, node.preview, node.search].filter(Boolean))
        .join(' '),
    ])
  );

  const index = manifest.notes.map((note) => ({
    slug: note.slug,
    title: note.title,
    description: note.folder || '',
    folder: note.folder,
    tags: note.tags,
    updated: note.updated,
    content: (contentBySlug.get(note.slug) || '').slice(0, 12000),
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
