from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.analysis import JobStatus, StrictModel

CountUnit = Literal["characters", "bytes", "words", "unknown"]


class PostingRequest(StrictModel):
    text: str = Field(min_length=1, max_length=80000)

    @field_validator("text")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("공고 본문을 입력해 주세요.")
        return value


class PostingText(StrictModel):
    value: str | None
    needsCheck: bool
    sources: list[str]


class PostingLimit(StrictModel):
    value: int | None = Field(ge=1)
    unit: CountUnit
    includesSpaces: bool | None
    needsCheck: bool
    sources: list[str]


class ExtractedQuestion(StrictModel):
    title: PostingText
    limit: PostingLimit


class StructuredPosting(StrictModel):
    company: PostingText
    job: PostingText
    skills: list[PostingText]
    questions: list[ExtractedQuestion]


class PostingQuestion(StrictModel):
    id: str
    no: int = Field(ge=1)
    title: str
    limit: int | None = Field(ge=1)
    countUnit: CountUnit
    includesSpaces: bool | None
    needsCheck: bool


class PostingData(StrictModel):
    company: str | None
    job: str | None
    skills: list[str]
    questions: list[PostingQuestion]

    @model_validator(mode="after")
    def unique_questions(self):
        if len({q.id for q in self.questions}) != len(self.questions):
            raise ValueError("문항 ID는 중복될 수 없습니다.")
        return self


class AcceptedPosting(StrictModel):
    jobId: str
    postingId: str
    status: JobStatus


class PostingAnalysisView(StrictModel):
    postingId: str
    jobId: str
    data: PostingData
    evidence: StructuredPosting
    missingFields: list[str]
    needsManualQuestions: bool
    warnings: list[str]
