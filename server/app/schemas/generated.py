"""HTTP import contracts for A's JSON results. No imports from the separate A app."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImportModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AIQuestion(ImportModel):
    id: str = Field(min_length=1, max_length=128)
    no: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=10000)
    limit: int | None = Field(default=None, ge=1)
    countUnit: Literal["characters", "bytes", "words", "unknown"] = "unknown"
    includesSpaces: bool | None = None
    needsCheck: bool = False


class PostingAnalysis(ImportModel):
    company: str | None = Field(default=None, max_length=500)
    job: str | None = Field(default=None, max_length=500)
    skills: list[str] = Field(default_factory=list, max_length=100)
    questions: list[AIQuestion] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def unique_questions(self):
        if len({q.id for q in self.questions}) != len(self.questions) or len({q.no for q in self.questions}) != len(self.questions):
            raise ValueError("문항 ID와 번호는 중복될 수 없습니다.")
        return self


class PostingImport(ImportModel):
    sourcePostingId: str = Field(min_length=1, max_length=128)
    sourceType: Literal["TEXT", "URL"] = "TEXT"
    url: str | None = Field(default=None, max_length=2048)
    rawText: str = Field(min_length=1, max_length=80000)
    analysis: PostingAnalysis
    evidence: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_source(self):
        self.sourcePostingId, self.rawText = self.sourcePostingId.strip(), self.rawText.strip()
        if not self.sourcePostingId or not self.rawText:
            raise ValueError("공고 분석 ID와 본문을 입력해 주세요.")
        if self.sourceType == "URL" and (not self.url or not self.url.startswith(("https://", "http://"))):
            raise ValueError("URL 공고는 http/https 주소가 필요합니다.")
        return self
