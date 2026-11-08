-- 학번·비밀번호 로그인용 (01, 02를 실행한 뒤에 실행)
-- 학번은 로그인 아이디라서 사람마다 달라야 함 → unique. 아직 등록 안 한 사람은 null (null끼리는 중복 OK)
alter table profiles add column if not exists student_id text unique;
