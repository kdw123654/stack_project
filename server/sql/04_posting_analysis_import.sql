-- Existing installations: run after 01_schema.sql / 03_student_login.sql.
-- Adds per-user A posting ID correlation/provenance. Does not delete data.
alter table job_postings add column if not exists source_analysis_id text;
alter table job_postings add column if not exists source_analysis_hash text;
alter table job_postings add column if not exists analysis_metadata jsonb not null default '{}';
create unique index if not exists job_postings_user_source_analysis_uidx
  on job_postings (user_id, source_analysis_id);
