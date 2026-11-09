from typing import Literal

from pydantic import Field, model_validator

from app.schemas.analysis import StrictModel
from app.schemas.job_posting import PostingData


class ExperienceAsset(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(max_length=200)


class Experience(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(max_length=10000)
    role: str = Field(default="", max_length=1000)
    period: str = Field(default="", max_length=200)
    achievements: list[str] = Field(default_factory=list, max_length=30)
    skills: list[str] = Field(default_factory=list, max_length=50)
    assets: list[ExperienceAsset] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def unique_assets(self):
        self.id, self.title = self.id.strip(), self.title.strip()
        if not self.id or not self.title:
            raise ValueError("경험 ID와 제목은 비어 있을 수 없습니다.")
        if len({a.id for a in self.assets}) != len(self.assets):
            raise ValueError("이미지 ID는 경험 내에서 중복될 수 없습니다.")
        return self


class Criterion(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    aliases: list[str] = Field(default_factory=list, max_length=20)
    minimumEvidence: int = Field(default=1, ge=1, le=100)

    @model_validator(mode="after")
    def nonblank(self):
        self.id, self.name = self.id.strip(), self.name.strip()
        if not self.id or not self.name:
            raise ValueError("역량 기준 ID와 이름을 입력해 주세요.")
        return self


class CareerInput(StrictModel):
    experiences: list[Experience] = Field(max_length=100)

    @model_validator(mode="after")
    def unique_experiences(self):
        if len({e.id for e in self.experiences}) != len(self.experiences):
            raise ValueError("경험 ID는 중복될 수 없습니다.")
        return self


class MatchRequest(CareerInput):
    posting: PostingData
    kind: Literal["cover", "slides"] = "cover"


class DiagnosisRequest(CareerInput):
    targetJob: str = Field(min_length=1, max_length=100)
    criteriaVersion: str = Field(min_length=1, max_length=100)
    criteriaSource: str = Field(min_length=1, max_length=500)
    criteria: list[Criterion] = Field(max_length=50)

    @model_validator(mode="after")
    def unique_criteria(self):
        self.targetJob, self.criteriaVersion, self.criteriaSource = self.targetJob.strip(), self.criteriaVersion.strip(), self.criteriaSource.strip()
        if not self.targetJob or not self.criteriaVersion or not self.criteriaSource:
            raise ValueError("목표 직무와 역량 기준의 버전·출처가 필요합니다.")
        if len({c.id for c in self.criteria}) != len(self.criteria):
            raise ValueError("역량 기준 ID는 중복될 수 없습니다.")
        return self


class DraftRequest(CareerInput):
    posting: PostingData
    # Empty map means all provided experiences may support each question.
    questionExperienceIds: dict[str, list[str]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_selection(self):
        question_ids = [q.id for q in self.posting.questions]
        if len(set(question_ids)) != len(question_ids):
            raise ValueError("문항 ID는 중복될 수 없습니다.")
        ids = {e.id for e in self.experiences}
        for qid, selected in self.questionExperienceIds.items():
            if qid not in question_ids or not selected or not set(selected) <= ids:
                raise ValueError("문항별 선택 경험을 확인해 주세요.")
        return self


class RegenerateRequest(DraftRequest):
    previousText: str = Field(min_length=1, max_length=20000)
    instructions: str = Field(default="", max_length=1000)


class Citation(StrictModel):
    experienceId: str
    quote: str


class Sentence(StrictModel):
    text: str
    sources: list[Citation]


class GeneratedAnswer(StrictModel):
    questionId: str
    sentences: list[Sentence]


class GeneratedCover(StrictModel):
    answers: list[GeneratedAnswer]


class SlidePlan(StrictModel):
    type: Literal["표지", "소개", "프로젝트", "성과", "요약", "마무리"]
    title: str
    sourceExperienceIds: list[str]


class GeneratedOutline(StrictModel):
    slides: list[SlidePlan]


class OutlineRequest(CareerInput):
    posting: PostingData
    size: Literal[6, 10, 14] = 10


class SlideOutline(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    type: Literal["표지", "소개", "프로젝트", "성과", "요약", "마무리"]
    title: str = Field(min_length=1, max_length=200)
    sourceExperienceIds: list[str]


class PortfolioRequest(OutlineRequest):
    outline: list[SlideOutline] = Field(min_length=6, max_length=14)

    @model_validator(mode="after")
    def valid_outline(self):
        if len(self.outline) != self.size or len({s.id for s in self.outline}) != self.size:
            raise ValueError("슬라이드 수와 고유 ID가 분량과 일치해야 합니다.")
        ids = {e.id for e in self.experiences}
        if any(not set(s.sourceExperienceIds) <= ids for s in self.outline):
            raise ValueError("슬라이드에 알 수 없는 경험 ID가 있습니다.")
        if any(not s.sourceExperienceIds for s in self.outline):
            raise ValueError("각 슬라이드에 근거 경험을 선택해 주세요.")
        return self


class GeneratedMetric(StrictModel):
    label: str
    value: float = Field(allow_inf_nan=False)
    unit: str
    source: Citation


class GeneratedSlide(StrictModel):
    slideId: str
    sentences: list[Sentence]
    metrics: list[GeneratedMetric]
    imageIds: list[str]


class GeneratedPortfolio(StrictModel):
    slides: list[GeneratedSlide]


class SemanticMatch(StrictModel):
    experienceId: str
    fit: Literal["high", "mid", "low"]
    matchedSkills: list[str]
    recommendedQuestionIds: list[str]
    rationale: Sentence


class GeneratedMatches(StrictModel):
    items: list[SemanticMatch]


class CompetencyEvidence(StrictModel):
    criterionId: str
    sources: list[Citation]


class GeneratedCompetencies(StrictModel):
    items: list[CompetencyEvidence]


class AcceptedTask(StrictModel):
    jobId: str
    taskId: str
    status: str


class TaskResult(StrictModel):
    taskId: str
    jobId: str
    kind: str
    data: dict
    needsReview: bool = True
