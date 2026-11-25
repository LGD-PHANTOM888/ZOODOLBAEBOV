import type { APIRoute } from 'astro';
import manifest from '../data/manifest.json';

export const GET: APIRoute = () => {
  const index = manifest.notes.map((note) => ({
    slug: note.slug,
    title: note.title,
    description: note.description,
    folder: note.folder,
    tags: note.tags,
    updated: note.updated,
  }));
  return new Response(JSON.stringify(index), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
