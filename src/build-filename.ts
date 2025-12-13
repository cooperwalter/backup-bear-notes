export default function buildFilename(title: string, noteId?: number | string | null): string {
  const MAX_BYTES = 251;
  const sanitized = title.replace(/\//g, '-');

  let base = sanitized;
  if (sanitized.trim() === '' && noteId !== undefined && noteId !== null) {
    base = `untitled-${noteId}`;
  }

  let truncated = base;
  while (Buffer.byteLength(truncated, 'utf8') > MAX_BYTES) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}.md`;
}
