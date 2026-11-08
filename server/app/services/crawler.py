import httpx
from bs4 import BeautifulSoup
from app.common import ApiError

HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; STACK-bot/0.1)'}
MAX_CHARS = 30000

def fetch_posting(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        raise ApiError(400, "INVALID_URL", "http로 시작하는 공고 링크를 넣어 주세요.")
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError:
        raise ApiError(422, "POSTING_FETCH_FAILED", "공고를 불러오지 못했어요. 텍스트 붙여넣기를 이용해 주세요.")

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()
    lines = [line.strip() for line in soup.get_text("\n").splitlines()]
    text = "\n".join(line for line in lines if line)

    if len(text) < 200:  
        raise ApiError(422, "POSTING_FETCH_FAILED", "공고 내용을 읽을 수 없는 페이지예요. 텍스트 붙여넣기를 이용해 주세요.")
    return text[:MAX_CHARS]