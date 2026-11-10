-- Apply before using portfolio image upload/rendering.
alter table portfolios add column if not exists image_assets jsonb not null default '{}';
