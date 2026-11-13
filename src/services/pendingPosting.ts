// 탐색 탭 공고 → 나의 경험의 자소서·포폴 흐름으로 공고 내용을 넘겨요 (이 탭에서만 유지)
const KEY = 'stack.pendingPosting';

export interface PendingPosting { title: string; text: string; url?: string | null }

export function setPendingPosting(p: PendingPosting) {
  try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 저장 못 하면 직접 붙여넣기 */ }
}

export function peekPendingPosting(): PendingPosting | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function clearPendingPosting() {
  try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ }
}
