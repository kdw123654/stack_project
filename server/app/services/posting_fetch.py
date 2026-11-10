import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup

from app.common import ApiError

MAX_BYTES = 2 * 1024 * 1024
MAX_CHARS = 60000


def check_public_url(url: str):
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError
        if parsed.port not in (None, 80, 443):
            raise ValueError
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise ValueError
    except (ValueError, OSError):
        raise ApiError(400, "INVALID_URL", "공개 http/https 공고 주소를 입력해 주세요.") from None


def fetch_posting(url: str) -> str:
    current = url.strip()
    try:
        with httpx.Client(timeout=15, follow_redirects=False, trust_env=False,
                          headers={"User-Agent": "STACK-job-reader/1.0"}) as client:
            for _ in range(4):
                check_public_url(current)
                with client.stream("GET", current) as response:
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("location")
                        if not location:
                            break
                        current = urljoin(current, location)
                        continue
                    response.raise_for_status()
                    media = response.headers.get("content-type", "text/html").split(";")[0].strip().lower()
                    if media not in ("text/html", "text/plain", "application/xhtml+xml"):
                        raise ApiError(422, "UNSUPPORTED_POSTING_CONTENT", "HTML·텍스트 공고만 읽을 수 있습니다. 본문을 붙여넣어 주세요.")
                    chunks, total = [], 0
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > MAX_BYTES:
                            raise ApiError(413, "POSTING_TOO_LARGE", "공고 페이지가 너무 큽니다. 본문을 붙여넣어 주세요.")
                        chunks.append(chunk)
                    html = b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")
                    soup = BeautifulSoup(html, "html.parser")
                    for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
                        tag.decompose()
                    text = "\n".join(line.strip() for line in soup.get_text("\n").splitlines() if line.strip())
                    if len(text) < 80:
                        raise ApiError(422, "POSTING_FETCH_FAILED", "본문을 읽지 못했습니다. 로그인·동적 페이지는 텍스트를 붙여넣어 주세요.")
                    if len(text) > MAX_CHARS:
                        raise ApiError(413, "POSTING_TOO_LARGE", "공고 본문이 너무 깁니다. 필요한 부분을 붙여넣어 주세요.")
                    return text
    except httpx.HTTPError:
        raise ApiError(422, "POSTING_FETCH_FAILED", "공고를 불러오지 못했습니다. 텍스트 붙여넣기를 이용해 주세요.") from None
    raise ApiError(422, "POSTING_FETCH_FAILED", "공고 주소 이동 횟수가 너무 많습니다. 본문을 붙여넣어 주세요.")
