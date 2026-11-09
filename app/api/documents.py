from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.schemas.document import ErrorResponse, ExtractedDocument
from app.services.extraction import MAX_FILE_BYTES
from app.services.documents import parse_document

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post(
    "/extract",
    response_model=ExtractedDocument,
    responses={code: {"model": ErrorResponse} for code in (413, 415, 422)},
    summary="문서 텍스트 추출 (AI 호출 없이 OCR 필요 여부 표시)",
)
def extract_document(file: Annotated[UploadFile, File()]) -> ExtractedDocument:
    # Sync routes run in FastAPI's thread pool, keeping PDF parsing off the event loop.
    try:
        content = file.file.read(MAX_FILE_BYTES + 1)
        return parse_document(content, file.filename or "")
    finally:
        file.file.close()
