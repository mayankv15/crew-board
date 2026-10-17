const KEY = 'crewboard.pageSize';
export const PAGE_SIZES = [10, 25, 50, 100];
const FALLBACK = 25;

export function loadPageSize(): number {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return PAGE_SIZES.includes(stored) ? stored : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function savePageSize(size: number): void {
  try {
    localStorage.setItem(KEY, String(size));
  } catch {
    return;
  }
}
