-- 개발용 예시 데이터 (Figma 화면에 나온 값). 실제 데이터는 나중에 교체.
insert into policies (type, version, effective_date, body) values
  ('privacy', 'v0.1', '2026-11-01', '1. 수집하는 개인정보 항목 ... (초안)'),
  ('terms',   'v0.1', '2026-11-01', '제1조 (목적) ... (초안)'),
  ('ai-data', 'v0.1', '2026-11-01', '01 AI가 처리하는 데이터 ... (초안)');

insert into explore_postings (type, tag, title, organization, description, deadline) values
  ('CAMPUS',   '특강',     '수원대학교 ADsP 자격증 특강', '수원대학교', '데이터 분석 역량 강화, 비교과 포인트 인정', '2026-11-13'),
  ('CAMPUS',   '비교과',   '2026 하반기 실무 마케팅 부트캠프', '수원대학교 취업지원팀', '현직 컨설턴트 무료 자소서 코칭 연계', '2026-11-18'),
  ('EXTERNAL', '대외활동', 'IT 서비스 기획 서포터즈 5기 모집', 'OO기업', '서비스 기획, 사용자 리서치 활동', '2026-11-09');

insert into employment_stats (year, scope, label, value, unit, source) values
  (2025, 'SCHOOL', '취업률', 0, '%', '수원대학교 대학 정보공시 (값 입력 필요)'),
  (2025, 'DEPARTMENT_JOB', '기획', 19, '%', '예시 값'),
  (2025, 'DEPARTMENT_JOB', '연구개발', 13, '%', '예시 값'),
  (2025, 'DEPARTMENT_JOB', 'IT 전산', 17, '%', '예시 값');

insert into seniors (display_name, company, position, career_years, department, grad_year, job_category, verified, hire_specs, timeline) values
  ('김OO', '네이버', '서비스 기획자', 2, '경영학과', 2023, 'IT 플랫폼', true,
   '["ADsP", "IT 스타트업 인턴 6개월", "데이터분석 대상", "TOEIC 870"]',
   '[{"grade":"1~2학년","text":"교내 비교과 프로그램·경영 동아리 활동"},{"grade":"3학년","text":"수원대 공모전 참가 및 대상 수상"},{"grade":"4학년","text":"IT 서비스 기획 인턴 6개월"},{"grade":"현재","text":"네이버 서비스 기획자 (정규직)"}]'),
  ('이OO', '카카오페이', '프론트엔드 개발자', 1, '컴퓨터학부', 2024, 'IT 플랫폼', true,
   '["정보처리기사", "오픈소스 기여", "부트캠프 수료"]', '[]');

insert into programs (title, description) values
  ('현직 컨설턴트 무료 자소서 코칭', '수원대 취업지원팀 추천 프로그램');
