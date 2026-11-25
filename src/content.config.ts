import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    folder: z.string().default(''),
    updated: z.coerce.date(),
    source: z.string().default(''),
    kind: z.string().default('note'),
  }),
});

export const collections = { notes };
