# 포트폴리오 이미지와 파일 출력

기존 DB에는 `server/sql/07_portfolio_images.sql`을 적용합니다. 신규 `01_schema.sql`에는 `image_assets` 컬럼이 포함되어 있습니다. B 서버 의존성을 설치하고, PDF 출력에는 LibreOffice와 한글 폰트가 필요합니다. Linux 예: `libreoffice-impress`, `fonts-noto-cjk`. `SOFFICE_PATH`로 변환기 경로, `PORTFOLIO_FONT`로 설치된 폰트 이름을 지정할 수 있습니다. 기본 폰트는 macOS에서 Apple SD Gothic Neo, 그 외 환경에서 Noto Sans CJK KR입니다.

## 이미지 업로드·교체

1. A 결과를 B에 저장하여 슬라이드 `imageIds`를 등록합니다. A 추출 이미지 다운로드 API로 해당 바이너리를 받습니다.
2. `POST /api/v1/portfolios/{id}/images`에 로그인 토큰과 multipart `imageId`, `file`을 보냅니다.
3. `GET /api/v1/portfolios/{id}/images/{imageId}`로 인증된 PNG 미리보기를 받을 수 있습니다.
4. 같은 ID에 새 파일을 업로드하면 이미지가 교체됩니다. 다른 ID를 선택하려면 기존 슬라이드 PATCH의 `imageIds`로 먼저 선택합니다. `[]`로 이미지를 제거할 수 있습니다.

프로젝트 소유자만 사용할 수 있고 현재 저장된 슬라이드가 참조하는 ID만 업로드할 수 있습니다. 이미지 ID는 프로젝트 내 키입니다. A의 ID 소유권을 서버 간 자동 확인하는 기능은 없으며, 업로드 파일은 현재 인증된 사용자 소유 프로젝트에 저장됩니다. 입력 최대 2MiB·2천만 픽셀, 최대 변 2,000px로 PNG 정규화합니다. 프로젝트당 ID 50개, ID별 교체 이력 250개 제한입니다. 동일 내용 재전송은 `reused:true`, 동시 변경은 409입니다. 저장본 교체 후 이전 바이너리를 삭제하며 실패한 삭제 경로도 탈퇴 시 정리 대상에 유지합니다.

## POST /api/v1/portfolios/{id}/export

기존 `{ "format": "PPTX" }` / `{ "format": "PDF" }` 요청과 `{format,downloadUrl}` 응답을 유지합니다. 텍스트·수치 카드뿐 아니라 저장된 이미지 바이너리와 실제 PowerPoint 차트를 그립니다. PDF는 같은 PPTX를 LibreOffice로 변환합니다. 변환마다 전용 프로필을 사용하고 임시 파일은 업로드 후 정리합니다.

`chartData` 예:

```json
[{"type":"bar","unit":"%","labels":["응답 시간 개선"],"values":[30]}]
```

차트 항목명과 값의 개수는 같아야 하고 1~20개, 값은 유한한 숫자여야 합니다. 한 장에는 이미지와 차트를 합쳐 최대 4개를 배치합니다. 초과/잘못된 차트는 422 `INVALID_SLIDE_VISUALS`, 미업로드 이미지는 409 `IMAGE_NOT_UPLOADED`로 알려주며 조용히 누락하지 않습니다. 표지와 마무리에도 이미지를 출력합니다. 수동 슬라이드 PATCH는 `imageIds`, `chartData`도 지원합니다.

검증: 로컬 테스트에서 인증된 저장→이미지 업로드·교체→PPTX 내보내기 흐름과 실제 차트 숫자/이미지 삽입을 확인했습니다. LibreOffice PDF 변환도 별도 실행했습니다. 실제 Supabase DB·스토리지 및 운영 폰트 구성은 배포 환경에서 확인해야 합니다.
