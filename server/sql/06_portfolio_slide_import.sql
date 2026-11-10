-- Existing installations: apply before using PUT /portfolios/{id}/slides.
alter table portfolios add column if not exists ai_imports jsonb not null default '{}';
