export default function folderUrl(folder: string, base: string = import.meta.env.BASE_URL): string {
  if (!folder) return `${base}graph/`;
  const segments = folder.split('/').filter(Boolean).map((part) => encodeURIComponent(part));
  return `${base}graph/folder/${segments.join('/')}/`;
}
