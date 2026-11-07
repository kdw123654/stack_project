from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PyPdfError

from app.schemas.document import DocumentPage, ExtractedDocument

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_PAGES = 200


class ExtractionError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def extract_pdf(content: bytes, filename: str) -> ExtractedDocument:
    """Extract page text without saving files or calling external AI services."""
    if len(content) > MAX_FILE_BYTES:
        raise ExtractionError("FILE_TOO_LARGE", "파일은 최대 20MiB까지 가능합니다.", 413)
    if Path(filename).suffix.lower() != ".pdf":
        raise ExtractionError("UNSUPPORTED_FILE_TYPE", "현재 PDF 파일만 지원합니다.", 415)
    if not content:
        raise ExtractionError("EMPTY_FILE", "빈 파일은 분석할 수 없습니다.")
    if not content.startswith(b"%PDF-"):
        raise ExtractionError("INVALID_PDF", "유효한 PDF 파일이 아닙니다.")

    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            raise ExtractionError("ENCRYPTED_PDF", "암호를 해제한 뒤 다시 업로드해 주세요.")
        count = len(reader.pages)
        if count == 0:
            raise ExtractionError("EMPTY_PDF", "PDF에 페이지가 없습니다.")
        if count > MAX_PAGES:
            raise ExtractionError("TOO_MANY_PAGES", "PDF는 최대 200페이지까지 가능합니다.")
        pages = []
        for number, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            pages.append(DocumentPage(page=number, text=text, needsOcr=not text))
    except ExtractionError:
        raise
    except (PyPdfError, ValueError, TypeError, KeyError, IndexError, RecursionError) as exc:
        raise ExtractionError("INVALID_PDF", "PDF를 읽을 수 없습니다. 파일 손상 여부를 확인해 주세요.") from exc

    needs_ocr = sum(page.needsOcr for page in pages)
    status = "needs_ocr" if needs_ocr == count else "partial" if needs_ocr else "extracted"
    return ExtractedDocument(
        fileName=filename, pageCount=count, status=status, pages=pages
    )
