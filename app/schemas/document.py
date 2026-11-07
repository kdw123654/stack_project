from typing import Literal

from pydantic import BaseModel, Field


class DocumentPage(BaseModel):
    page: int = Field(ge=1)
    text: str
    needsOcr: bool


class ExtractedDocument(BaseModel):
    fileName: str
    pageCount: int = Field(ge=1)
    status: Literal["extracted", "partial", "needs_ocr"]
    pages: list[DocumentPage]


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
