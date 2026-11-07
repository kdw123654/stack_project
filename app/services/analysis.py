import json
import re

from app.config import Settings
from app.errors import AppError
from app.prompts import COMMON, MODE_PROMPTS
from app.schemas.analysis import (
    AnalysisOutput, GroundedField, Mode, PortfolioOutput, PortfolioResult,
    PortfolioRole, ResultSection, ResumeOutput, ResumeResult, SpecupOutput,
    SpecupResult, StructuredAnalysis,
)
from app.schemas.document import ExtractedDocument
from app.services.llm import LLM


def normalize(text: str) -> str:
    return " ".join(text.split())


def numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:[.,]\d+)*%?", text))


def analyze(llm: LLM, settings: Settings, mode: Mode, documents: dict[str, ExtractedDocument],
            ocr_sources: set[tuple[str, int]], memo: str, target_job: str,
            request_id: str) -> tuple[AnalysisOutput, StructuredAnalysis, list[str]]:
    payload = json.dumps({
        "mode": mode.value, "memo": memo, "targetJob": target_job,
        "documents": [{"fileId": file_id, "fileName": doc.fileName, "unit": doc.unit,
                       "pages": [page.model_dump() for page in doc.pages if page.text]}
                      for file_id, doc in documents.items()],
    }, ensure_ascii=False)
    if len(payload) > settings.max_context_characters:
        raise AppError("CONTEXT_TOO_LARGE", "문서 텍스트가 너무 깁니다. 파일을 나누어 분석해 주세요.")
    raw = llm.parse(StructuredAnalysis, COMMON + MODE_PROMPTS[mode], payload, request_id)
    warnings = []
    index = {(file_id, page.page): normalize(page.text)
             for file_id, document in documents.items() for page in document.pages}

    def valid_sources(sources):
        return [source for source in sources if source.quote.strip()
                and normalize(source.quote) in index.get((source.fileId, source.page), "")]

    def check(field: GroundedField) -> None:
        sources = valid_sources(field.sources)
        supporting_text = " ".join(source.quote for source in sources)
        if not field.value or not sources or not numbers(field.value).issubset(numbers(supporting_text)):
            if field.value:
                warnings.append("UNSUPPORTED_FIELD_REMOVED")
            field.value, field.needsCheck, field.sources = None, True, []
        else:
            field.needsCheck = (field.needsCheck or len(sources) != len(field.sources)
                                or any((s.fileId, s.page) in ocr_sources for s in sources))
            field.sources = sources

    check(raw.summary)
    for section in raw.sections:
        check(section.field)
    for skill in raw.skills:
        check(skill)
    for group in raw.owned:
        for item in group.items:
            check(item)
    raw.gaps = [gap for gap in raw.gaps if valid_sources(gap.sources)] if target_job else []
    for gap in raw.gaps:
        gap.sources = valid_sources(gap.sources)
    output = to_output(mode, raw, documents)
    # Enforce the typed result once more after all grounding transformations.
    return output, raw, sorted(set(warnings))


def to_output(mode: Mode, raw: StructuredAnalysis, documents: dict[str, ExtractedDocument]) -> AnalysisOutput:
    sections = [ResultSection(key=s.key, label=s.label, value=s.field.value or "",
                              needsCheck=s.field.needsCheck) for s in raw.sections]
    skills = [skill.value for skill in raw.skills if skill.value]
    if mode == Mode.RESUME:
        return ResumeOutput(mode="resume", data=ResumeResult(summary=raw.summary.value or "", sections=sections, skills=skills))
    if mode == Mode.SPECUP:
        return SpecupOutput(mode="specup", data=SpecupResult(
            owned=[{"group": group.group, "items": [item.value for item in group.items if item.value]}
                   for group in raw.owned if any(item.value for item in group.items)],
            gaps=[gap.model_dump(exclude={"sources"}) for gap in raw.gaps],
        ))

    def first(key):
        return next((s.value for s in sections if s.key == key and s.value), "")

    # Keep unknown contributions null, even though the current FE type requires a number.
    contribution_text = first("contribution")
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*%\s*", contribution_text)
    contribution = float(match.group(1)) if match and float(match.group(1)) <= 100 else None
    return PortfolioOutput(mode="portfolio", data=PortfolioResult(
        summary=raw.summary.value or "", category=first("category"), period=first("period"),
        source={"name": ", ".join(doc.fileName for doc in documents.values()),
                "pages": sum(doc.pageCount for doc in documents.values())},
        sections=sections, role=PortfolioRole(title=first("role"), team=first("team"),
                                            contribution=contribution,
                                            duties=[s.value for s in sections if s.key == "role" and s.value]),
        process=[{"title": s.label, "desc": s.value} for s in sections if s.key == "process" and s.value],
        metrics=[{"value": s.value, "label": s.label, "needsCheck": s.needsCheck}
                 for s in sections if s.key == "metric" and s.value],
        skills=skills,
    ))
