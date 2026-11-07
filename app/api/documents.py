from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.schemas.document import ErrorResponse, ExtractedDocument
from app.services.extraction import MAX_FILE_BYTES, extract_pdf

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post(
    "/extract",
    response_model=ExtractedDocument,
    responses={code: {"model": ErrorResponse} for code in (413, 415, 422)},
    summary="PDF 페이지별 텍스트 추출 (AI 분석 전 단계)",
)
def extract_document(file: Annotated[UploadFile, File()]) -> ExtractedDocument:
    # Sync routes run in FastAPI's thread pool, keeping PDF parsing off the event loop.
    try:
        content = file.file.read(MAX_FILE_BYTES + 1)
        return extract_pdf(content, file.filename or "")
    finally:
        file.file.close()
