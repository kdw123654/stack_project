import hashlib
import json
from copy import deepcopy
from datetime import datetime

from app.common import ApiError, now_iso
from app.db import db

MAX_IMPORTS = 250


def payload_hash(payload) -> str:
    value = payload.model_dump(mode="json", exclude={"expectedUpdatedAt"})
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(encoded) > 500000:
        raise ApiError(413, "IMPORT_TOO_LARGE", "저장할 생성 결과가 너무 큽니다.")
    return hashlib.sha256(encoded.encode()).hexdigest()


def check_replay(row: dict, source_id: str, fingerprint: str) -> bool:
    previous = (row.get("ai_imports") or {}).get(source_id)
    if previous is None:
        return False
    if previous != fingerprint:
        raise ApiError(409, "IMPORT_CONFLICT", "같은 생성 작업 ID에 다른 내용을 저장할 수 없습니다.")
    return True


def persist_import(table: str, row: dict, user_id: str, payload, changes: dict) -> tuple[dict, bool]:
    fingerprint = payload_hash(payload)
    if check_replay(row, payload.sourceTaskId, fingerprint):
        return row, True
    if payload.expectedUpdatedAt is not None:
        current = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
        if current != payload.expectedUpdatedAt:
            raise ApiError(409, "VERSION_CONFLICT", "프로젝트가 변경되었습니다. 최신 내용을 확인해 주세요.")
    imports = dict(row.get("ai_imports") or {})
    if len(imports) >= MAX_IMPORTS:
        raise ApiError(409, "IMPORT_LIMIT", "프로젝트 생성 이력 한도에 도달했습니다. 새 프로젝트를 만들어 주세요.")
    imports[payload.sourceTaskId] = fingerprint
    result = (db.table(table).update({**changes, "ai_imports": imports, "updated_at": now_iso()})
              .eq("id", row["id"]).eq("user_id", user_id).eq("updated_at", row["updated_at"]).execute())
    if result.data:
        return result.data[0], False
    latest = db.table(table).select("*").eq("id", row["id"]).eq("user_id", user_id).maybe_single().execute()
    if latest is not None and latest.data is not None and check_replay(latest.data, payload.sourceTaskId, fingerprint):
        return latest.data, True
    raise ApiError(409, "VERSION_CONFLICT", "동시에 프로젝트가 변경되었습니다. 다시 조회해 주세요.")


def require_owned_experiences(ids: set[str], user_id: str) -> None:
    if not ids:
        return
    rows = db.table("experiences").select("id").eq("user_id", user_id).in_("id", sorted(ids)).execute().data
    if {row["id"] for row in rows} != ids:
        raise ApiError(404, "EXPERIENCE_NOT_FOUND", "선택한 경험 중 본인 소유가 아닌 경험이나 삭제된 경험이 있습니다.")


def normalize_questions(questions: list[dict]) -> list[dict]:
    result = []
    for question in questions:
        value = dict(question)
        value["id"] = value.get("id") or f"q{value['order']}"
        value.setdefault("countUnit", "characters")
        value.setdefault("includesSpaces", None)
        result.append(value)
    return result


def answer_counts(text: str, question: dict) -> dict:
    if not text.strip():
        raise ApiError(422, "EMPTY_ANSWER", "답변 내용은 비어 있을 수 없습니다.")
    unit = question.get("countUnit", "characters")
    spaces = question.get("includesSpaces")
    counted = "".join(text.split()) if spaces is False and unit != "words" else text
    count = len(counted.encode("utf-8")) if unit == "bytes" else len(text.split()) if unit == "words" else len(counted)
    limit = question.get("charLimit")
    if limit is not None and unit != "unknown" and count > limit:
        raise ApiError(422, "ANSWER_TOO_LONG", "답변이 문항의 분량 제한을 초과합니다.")
    return {"charCount": len(text), "count": count, "countUnit": unit,
            "includesSpaces": spaces, "charLimit": limit, "limit": limit}


def convert_answers(payload, posting: dict, user_id: str):
    questions = normalize_questions(posting["questions"])
    index = {q["id"]: q for q in questions}
    if len(index) != len(questions) or {a.questionId for a in payload.answers} != set(index):
        raise ApiError(422, "QUESTION_MISMATCH", "공고의 모든 문항에 대해 현재 문항 ID로 답변을 보내 주세요.")
    all_ids = set()
    answers, selections = [], []
    for answer in sorted(payload.answers, key=lambda a: index[a.questionId]["order"]):
        question = index[answer.questionId]
        refs = set(answer.usedExperiences) | {s.experienceId for line in answer.sentences for s in line.sources}
        all_ids.update(refs)
        value = answer.model_dump(mode="json")
        answers.append({**value, "questionOrder": question["order"], "content": answer.text,
                        **answer_counts(answer.text, question), "aiOriginal": deepcopy(value),
                        "reviewStatus": "NEEDS_REVIEW" if answer.needsCheck else "AI_EXTRACTED"})
        selections.append({"questionId": answer.questionId, "questionOrder": question["order"], "experienceIds": sorted(refs)})
    require_owned_experiences(all_ids, user_id)
    return answers, selections


def convert_slides(payload, user_id: str):
    refs = {ref for slide in payload.slides for ref in slide.sourceExperienceIds}
    for slide in payload.slides:
        cited = {c.experienceId for sentence in slide.sentences for c in sentence.sources}
        cited.update(metric.source.experienceId for metric in slide.metrics)
        if not cited <= set(slide.sourceExperienceIds):
            raise ApiError(422, "INVALID_SLIDE_SOURCE", "슬라이드 인용이 연결된 경험에 없습니다.")
    require_owned_experiences(refs, user_id)
    slides, outline = [], []
    for number, slide in enumerate(payload.slides, 1):
        value = slide.model_dump(mode="json")
        layout = ("COVER" if slide.type == "표지" else "CLOSING" if slide.type == "마무리" else
                  "RESULT_WITH_CHART" if slide.metrics else "PROJECT")
        body = "\n".join(s.text for s in slide.sentences) if slide.sentences else "\n".join(slide.corePhrases)
        metrics = [{**metric.model_dump(mode="json"), "numericValue": metric.value,
                    "value": f"{metric.value:g}{metric.unit}"} for metric in slide.metrics]
        slides.append({**value, "slideNo": number, "layout": layout, "aiLayout": slide.layout,
                       "body": body, "metrics": metrics, "aiOriginal": deepcopy(value), "needsReview": True})
        outline.append({"id": slide.id, "slideNo": number, "type": slide.type, "layout": layout,
                        "title": slide.title, "sourceExperienceIds": slide.sourceExperienceIds})
    return slides, outline, sorted(refs)
