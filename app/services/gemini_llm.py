"""Google Gemini 연결 (무료 등급 사용 가능).

OpenAILLM과 같은 parse() 모양을 지켜서, 나머지 코드는 어떤 AI를 쓰는지 몰라도 됩니다.
Gemini의 OpenAI 호환 주소는 Responses API를 지원하지 않으므로 Chat Completions + JSON Schema로 요청하고,
응답은 우리 pydantic 스키마로 다시 검사합니다.
"""
import base64
import copy
import json
import logging
import random
import time
from typing import TypeVar

import openai
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.errors import AppError

logger = logging.getLogger("stack.llm")
T = TypeVar("T", bound=BaseModel)


def inline_refs(schema: dict) -> dict:
    """$defs/$ref를 펼쳐서 참조 없는 JSON Schema로 만듭니다 (호환 계층이 $ref를 잘 못 읽는 경우 대비)."""
    defs = schema.get("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                target = copy.deepcopy(defs[node["$ref"].split("/")[-1]])
                extra = {k: v for k, v in node.items() if k != "$ref"}
                return resolve({**target, **extra})
            return {k: resolve(v) for k, v in node.items() if k != "$defs"}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


class GeminiLLM:
    def __init__(self, settings: Settings, client=None, sleep=time.sleep):
        self.settings = settings
        self.sleep = sleep
        key = settings.gemini_api_key.get_secret_value().strip()
        self.client = client or (openai.OpenAI(
            api_key=key, base_url=settings.gemini_base_url,
            timeout=settings.llm_timeout_seconds, max_retries=0,
        ) if key else None)

    @property
    def configured(self) -> bool:
        return self.client is not None

    def close(self) -> None:
        if self.client:
            self.client.close()

    def parse(self, schema: type[T], instructions: str, payload: str,
              request_id: str, image: bytes | None = None) -> T:
        if not self.configured:
            raise AppError("LLM_NOT_CONFIGURED", ".env에 GEMINI_API_KEY를 설정해 주세요.", 503)
        content = [{"type": "text", "text": payload}]
        if image is not None:
            encoded = base64.b64encode(image).decode("ascii")
            content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}})
        response_format = {"type": "json_schema", "json_schema": {
            "name": schema.__name__, "schema": inline_refs(schema.model_json_schema())}}

        for attempt in range(self.settings.llm_max_retries + 1):
            try:
                response = self.client.chat.completions.create(
                    model=self.settings.gemini_model,
                    messages=[{"role": "system", "content": instructions},
                              {"role": "user", "content": content}],
                    response_format=response_format,
                    max_tokens=self.settings.llm_max_output_tokens,
                )
                self._log_usage(response, request_id, attempt + 1)
                choice = response.choices[0] if response.choices else None
                text = choice.message.content if choice and choice.message else None
                if choice is None or choice.finish_reason not in ("stop", None) or not text:
                    raise AppError("LLM_INCOMPLETE", "AI 응답이 완료되지 않았습니다. 다시 시도해 주세요.", 502)
                return schema.model_validate_json(text)
            except openai.APITimeoutError:
                error = AppError("LLM_TIMEOUT", "AI 응답 시간이 초과되었습니다.", 504)
            except openai.APIConnectionError:
                error = AppError("LLM_UNAVAILABLE", "AI 서비스에 연결할 수 없습니다.", 502)
            except openai.APIStatusError as exc:
                if exc.status_code == 429:
                    # 무료 등급의 분당·일일 요청 한도. 짧게 다시 시도해도 풀리지 않는 경우가 많아 바로 알립니다.
                    raise AppError("LLM_RATE_LIMIT",
                                   "AI 무료 사용 한도를 넘었습니다. 1분 뒤(일일 한도면 내일) 다시 시도해 주세요.", 429) from None
                if exc.status_code < 500 and exc.status_code not in (408, 409):
                    raise AppError("LLM_REQUEST_REJECTED", "AI 요청 설정 또는 API 키를 확인해 주세요.", 502) from None
                error = AppError("LLM_UNAVAILABLE", "AI 서비스가 일시적으로 요청을 처리하지 못했습니다.", 502)
            except (ValidationError, json.JSONDecodeError):
                error = AppError("LLM_INVALID_RESPONSE", "AI 응답이 결과 형식과 일치하지 않습니다.", 502)
            except AppError as exc:
                error = exc
            # 원본 예외는 기록하지 않음: 문서 내용이나 키가 들어 있을 수 있음
            logger.warning("llm_retry provider=gemini request_id=%s attempt=%s code=%s",
                           request_id, attempt + 1, error.code)
            if attempt == self.settings.llm_max_retries:
                raise error from None
            self.sleep(min(2 ** attempt, 4) + random.random() * 0.25)
        raise AssertionError("unreachable")

    def _log_usage(self, response, request_id: str, attempt: int) -> None:
        usage = response.usage
        logger.info(json.dumps({
            "event": "llm_usage", "provider": "gemini", "request_id": request_id, "attempt": attempt,
            "model": response.model,
            "input_tokens": usage.prompt_tokens if usage else None,
            "output_tokens": usage.completion_tokens if usage else None,
        }))
