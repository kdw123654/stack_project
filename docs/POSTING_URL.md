# 공고 URL 본문 가져오기

B 서버의 `POST /api/v1/job-postings/fetch`에 로그인 토큰과 `{ "url": "https://공고주소" }`를 보냅니다.

성공 응답은 `200 {success:true,data:{sourceType:"URL",url,text}}`입니다. `text`를 A의 `POST /job-postings/analyze` 입력 `text`로 전달합니다. 분석이 끝나면 기존 `POST /api/v1/job-postings`에 A 분석 ID, 분석 결과, `sourceType:"URL"`, 원래 `url`, `rawText:text`를 보내 저장합니다. 본문 수집은 동기 요청이고 AI 분석은 기존 비동기 작업 API를 사용합니다.

HTTP/HTTPS 공개 주소만 허용하고 인증정보가 들어간 URL, 사설·루프백 IP, 80/443 외 포트는 거절합니다. 리다이렉트마다 DNS 주소를 다시 검사하며 최대 3회 이동합니다. 배포 환경에서는 DNS 변경을 이용한 우회를 막도록 송신 네트워크에서도 내부망 접근을 차단해야 합니다.

HTML·일반 텍스트만 지원하며 스크립트·스타일·탐색 영역을 제거합니다. 수신 크기는 2MiB, 본문은 60,000자까지입니다. 로그인·자바스크립트 렌더링이 필요한 사이트는 본문 붙여넣기를 사용합니다. 브라우저 자동화나 로그인 우회는 수행하지 않습니다.

- 400 `INVALID_URL`: 비공개 주소 또는 허용되지 않은 URL.
- 413 `POSTING_TOO_LARGE`: 페이지/본문 제한 초과.
- 422 `POSTING_FETCH_FAILED`: 통신 오류, 본문 부족, 이동 한도 초과.
- 422 `UNSUPPORTED_POSTING_CONTENT`: HTML·텍스트 이외 콘텐츠.
