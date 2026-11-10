-- Existing installations: apply before using PUT /cover-letters/{id}/answers.
alter table cover_letters add column if not exists ai_imports jsonb not null default '{}';
