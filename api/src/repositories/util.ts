import type { Page } from '@crew-board/shared';

export function toPage<T>(data: T[], total: number, page: number, pageSize: number): Page<T> {
  return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

// Escapes LIKE wildcards so a search for "100%" or "a_b" matches literally.
// Always used together with: LIKE @q ESCAPE '\'
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Comma-separated "?" placeholders for an IN (...) list. Only placeholders are built here;
// the values themselves are always bound parameters.
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export const nowIso = () => new Date().toISOString();
