import hashlib
import json

from app.common import ApiError


def payload_hash(payload) -> str:
    value = payload.model_dump(mode="json", exclude={"expectedUpdatedAt"})
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(encoded) > 500000:
        raise ApiError(413, "IMPORT_TOO_LARGE", "저장할 생성 결과가 너무 큽니다.")
    return hashlib.sha256(encoded.encode()).hexdigest()


def normalize_questions(questions: list[dict]) -> list[dict]:
    result = []
    for question in questions:
        value = dict(question)
        value["id"] = value.get("id") or f"q{value['order']}"
        value.setdefault("countUnit", "characters")
        value.setdefault("includesSpaces", None)
        result.append(value)
    return result
