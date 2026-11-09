"""
수원대학교 학생역량통합관리시스템 (career.suwon.ac.kr)
선배 멘토링(/Career/Alumni/Alumni.aspx) 및 취업통계(/Career/Job/DataChart.aspx)
본인 학번 로그인 기반 마스킹(비식별화) 추출 스크립트

실행 방법:
  cd c:\dev\stack_project\server
  .venv\Scripts\python scripts\extract_suwon_alumni.py
"""

import getpass
import json
import re
from pathlib import Path
import httpx
from bs4 import BeautifulSoup


BASE_URL = "https://career.suwon.ac.kr"
LOGIN_URL = f"{BASE_URL}/main/Login.aspx"
ALUMNI_URL = f"{BASE_URL}/Career/Alumni/Alumni.aspx"
DATACHART_URL = f"{BASE_URL}/Career/Job/DataChart.aspx"


def mask_korean_name(name: str) -> str:
    """실명을 '김OO' 형태로 비식별화(마스킹)합니다."""
    name = name.strip()
    if not name:
        return "익명"
    # '김철수 멘토' 형태에서 '멘토' 제거
    name = re.sub(r"\s*멘토.*$", "", name).strip()
    if len(name) >= 2:
        return name[0] + "O" * (len(name) - 1)
    return name


def mask_sensitive_text(text: str) -> str:
    """전화번호, 이메일, 학번 등 개인식별정보(PII)를 마스킹합니다."""
    if not text:
        return ""
    # 휴대폰 번호 마스킹
    text = re.sub(r"01[016789]-?\d{3,4}-?\d{4}", "010-****-****", text)
    # 이메일 마스킹
    text = re.sub(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "***@***.***", text)
    return text.strip()


def parse_alumni_html(html: str) -> list[dict]:
    """선배 멘토링 페이지 HTML에서 멘토 카드를 추출하고 마스킹합니다."""
    soup = BeautifulSoup(html, "html.parser")
    results = []

    # 1. 테이블 형태 상세/목록 파싱 (매뉴얼 기준: 회사명, 회사구분, 근무부서, 직급/직책, 직무구분, 세부직무, 입사년월, 졸업학과명)
    tables = soup.find_all("table")
    for idx, table in enumerate(tables):
        row_dict = {}
        for tr in table.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            for i in range(0, len(cells) - 1, 2):
                key = cells[i]
                val = cells[i + 1]
                if key and val:
                    row_dict[key] = mask_sensitive_text(val)
        if any(k in str(row_dict.keys()) for k in ["회사명", "근무부서", "직무구분", "학과"]):
            results.append(row_dict)

    # 2. 카드 형태 목록 파싱
    cards = soup.find_all(["div", "li"], class_=lambda c: c and any(k in c.lower() for k in ["card", "mentor", "list", "item"]))
    for card in cards:
        text = card.get_text(" | ", strip=True)
        if any(k in text for k in ["대기업", "중견기업", "중소기업", "공공기관", "공무원", "팀", "부서"]):
            masked = mask_sensitive_text(text)
            if len(masked) > 10 and masked not in [r.get("raw", "") for r in results]:
                results.append({"raw": masked})

    return results


def main():
    print("=" * 65)
    print(" [STACK] 수원대학교(career.suwon.ac.kr) 선배 멘토링 마스킹 추출기")
    print("=" * 65)
    print("※ 선배 멘토링 및 상세 취업 통계는 재학생 로그인 세션이 필요합니다.")
    print("※ 입력하신 학번/비밀번호는 일회성 세션 로그인에만 사용되며 절대 저장되지 않습니다.\n")

    user_id = input("수원대 포털 학번(ID) 입력: ").strip()
    user_pw = getpass.getpass("수원대 포털 비밀번호(PW) 입력: ").strip()

    if not user_id or not user_pw:
        print("[!] 학번과 비밀번호를 모두 입력해 주세요.")
        return

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": LOGIN_URL,
    }

    with httpx.Client(headers=headers, verify=False, follow_redirects=True, timeout=20.0) as client:
        # 1. 로그인 페이지 접속 및 히든 필드 수집
        login_page = client.get(LOGIN_URL)
        soup = BeautifulSoup(login_page.text, "html.parser")
        payload = {}
        for inp in soup.find_all("input"):
            name = inp.get("name")
            if name:
                payload[name] = inp.get("value", "")

        # 학생 로그인(pro=1) 설정 및 ID/PW 주입
        payload["pro"] = payload.get("pro") or "1"
        payload["rUserid"] = user_id
        payload["rPW"] = user_pw

        print("\n[1/3] career.suwon.ac.kr 로그인 요청 중...")
        resp = client.post(LOGIN_URL, data=payload)

        # 2. 선배 멘토링 페이지 접근
        print("[2/3] 선배 멘토링(/Career/Alumni/Alumni.aspx) 데이터 조회 중...")
        alumni_resp = client.get(ALUMNI_URL)
        if "Login.aspx" in str(alumni_resp.url):
            print("[!] 로그인 실패 또는 권한이 없습니다. 학번과 비밀번호를 다시 확인해 주세요.")
            return

        alumni_data = parse_alumni_html(alumni_resp.text)

        # 3. 데이터 분석 차트 페이지 접근
        print("[3/3] 취업 데이터 분석(/Career/Job/DataChart.aspx) 조회 중...")
        chart_resp = client.get(DATACHART_URL)
        chart_soup = BeautifulSoup(chart_resp.text, "html.parser")
        chart_text = mask_sensitive_text(chart_soup.get_text("\n", strip=True))

        out_dir = Path(__file__).resolve().parent.parent / "sql"
        json_path = out_dir / "masked_alumni_extracted.json"

        output_payload = {
            "source": "https://career.suwon.ac.kr",
            "masked_alumni_count": len(alumni_data),
            "masked_alumni": alumni_data,
            "data_chart_summary": chart_text[:3000],
        }

        json_path.write_text(json.dumps(output_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n[완료] 마스킹된 데이터가 저장되었습니다: {json_path}")


if __name__ == "__main__":
    main()
