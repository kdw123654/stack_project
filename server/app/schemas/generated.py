"""HTTP import contracts for A's JSON results. No imports from the separate A app."""
from datetime import datetime
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


class AICitation(ImportModel):
    experienceId: str = Field(min_length=1, max_length=128)
    quote: str = Field(max_length=20000)


class AISentence(ImportModel):
    text: str = Field(max_length=20000)
    sources: list[AICitation] = Field(default_factory=list, max_length=100)


class AIKeyword(ImportModel):
    label: str = Field(max_length=500)
    covered: bool


class AIAnswer(ImportModel):
    questionId: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=20000)
    count: int | None = Field(default=None, ge=0)
    countUnit: Literal["characters", "bytes", "words", "unknown"] = "unknown"
    includesSpaces: bool | None = None
    limit: int | None = Field(default=None, ge=1)
    needsCheck: bool = True
    usedExperiences: list[str] = Field(default_factory=list, max_length=100)
    sentences: list[AISentence] = Field(default_factory=list, max_length=200)
    keywords: list[AIKeyword] = Field(default_factory=list, max_length=100)


class ResultImport(ImportModel):
    sourceTaskId: str = Field(min_length=1, max_length=128)
    expectedUpdatedAt: datetime | None = None

    @model_validator(mode="after")
    def nonblank_task(self):
        self.sourceTaskId = self.sourceTaskId.strip()
        if not self.sourceTaskId:
            raise ValueError("생성 작업 ID를 입력해 주세요.")
        if self.expectedUpdatedAt is not None and self.expectedUpdatedAt.tzinfo is None:
            raise ValueError("expectedUpdatedAt에는 시간대를 포함해 주세요.")
        return self


class AnswersImport(ResultImport):
    answers: list[AIAnswer] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def unique_answers(self):
        if len({a.questionId for a in self.answers}) != len(self.answers):
            raise ValueError("같은 문항의 답변이 중복되었습니다.")
        return self
