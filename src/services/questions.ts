import type { Question } from '../types';

export function questionLimitLabel(question: Question): string {
  if (question.limit === null) return '분량 제한 확인 필요';
  const unit = { characters: '자', bytes: '바이트', words: '단어', unknown: '(단위 확인 필요)' }[question.countUnit ?? 'characters'];
  const spaces = question.includesSpaces === true ? '공백 포함' : question.includesSpaces === false ? '공백 제외' : '공백 기준 확인 필요';
  return `${question.limit}${unit} · ${spaces}${question.needsCheck ? ' · 확인 필요' : ''}`;
}

export function questionCount(text: string, question: Question): number | null {
  if (question.includesSpaces == null || question.countUnit === 'unknown') return null;
  // Backend count_text keeps word boundaries even with includesSpaces=false.
  if (question.countUnit === 'words') return text.trim() ? text.trim().split(/\s+/u).length : 0;
  const source = question.includesSpaces ? text : text.replace(/\s/gu, '');
  if (question.countUnit === 'bytes') return new TextEncoder().encode(source).length;
  return Array.from(source).length;
}
