from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.document import ErrorDetail


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Mode(StrEnum):
    RESUME = "resume"
    SPECUP = "specup"
    PORTFOLIO = "portfolio"


class Evidence(StrictModel):
    fileId: str
    page: int = Field(ge=1)
    quote: str


class GroundedField(StrictModel):
    value: str | None
    needsCheck: bool
    sources: list[Evidence]


class SourceSection(StrictModel):
    key: Literal["title", "organization", "period", "role", "achievement", "overview",
                 "problem", "process", "outcome", "team", "contribution", "category", "metric"]
    label: str
    field: GroundedField


class SpecGroup(StrictModel):
    group: str
    items: list[GroundedField]


class Gap(StrictModel):
    title: str
    reason: str
    action: str
    level: Literal["point", "blue"]
    sources: list[Evidence]


class StructuredAnalysis(StrictModel):
    """Provider output. Every factual field must cite original text."""
    summary: GroundedField
    sections: list[SourceSection]
    skills: list[GroundedField]
    owned: list[SpecGroup]
    gaps: list[Gap]


class ResultSection(BaseModel):
    key: str
    label: str
    value: str
    needsCheck: bool
    long: bool = False


class ResumeResult(BaseModel):
    summary: str
    sections: list[ResultSection]
    skills: list[str]


class SpecupResult(BaseModel):
    owned: list[dict[str, str | list[str]]]
    gaps: list[dict[str, str]]


class PortfolioRole(BaseModel):
    title: str
    team: str
    # Missing contribution must remain unknown; FE must allow null.
    contribution: float | None
    duties: list[str]


class PortfolioResult(BaseModel):
    summary: str
    category: str
    period: str
    source: dict[str, str | int]
    images: list[dict] = Field(default_factory=list)
    coverId: str = ""
    sections: list[ResultSection]
    role: PortfolioRole
    process: list[dict[str, str]]
    metrics: list[dict[str, str | bool]]
    skills: list[str]


class ResumeOutput(BaseModel):
    mode: Literal["resume"]
    data: ResumeResult


class SpecupOutput(BaseModel):
    mode: Literal["specup"]
    data: SpecupResult


class PortfolioOutput(BaseModel):
    mode: Literal["portfolio"]
    data: PortfolioResult


AnalysisOutput = Annotated[ResumeOutput | SpecupOutput | PortfolioOutput, Field(discriminator="mode")]


class FileOutcome(BaseModel):
    fileId: str
    fileName: str
    status: Literal["extracted", "partial", "failed"]
    unit: str | None = None
    unresolvedPages: list[int] = Field(default_factory=list)
    ocrPages: list[int] = Field(default_factory=list)
    error: ErrorDetail | None = None


class JobStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    PARTIAL_FAILED = "PARTIAL_FAILED"
    FAILED = "FAILED"


class JobView(BaseModel):
    jobId: str
    analysisId: str
    status: JobStatus
    stage: Literal["queued", "extracting", "analyzing", "validating", "completed", "failed"]
    createdAt: datetime
    updatedAt: datetime
    files: list[FileOutcome] = Field(default_factory=list)
    error: ErrorDetail | None = None


class AcceptedAnalysis(BaseModel):
    jobId: str
    analysisId: str
    status: JobStatus


class AnalysisView(BaseModel):
    analysisId: str
    jobId: str
    result: AnalysisOutput
    evidence: StructuredAnalysis
    files: list[FileOutcome]
    warnings: list[str]
