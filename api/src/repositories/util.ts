import type { Page } from '@crew-board/shared';

export function toPage<T>(data: T[], total: number, page: number, pageSize: number): Page<T> {
  return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export const nowIso = () => new Date().toISOString();
