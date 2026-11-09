import base64
import json
import logging
import random
import time
from typing import Protocol, TypeVar

import openai
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.errors import AppError

logger = logging.getLogger("stack.llm")
T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    @property
    def configured(self) -> bool: ...

    def parse(self, schema: type[T], instructions: str, payload: str,
              request_id: str, image: bytes | None = None) -> T: ...

    def close(self) -> None: ...


class OpenAILLM:
    def __init__(self, settings: Settings, client=None, sleep=time.sleep):
        self.settings = settings
        self.sleep = sleep
        key = settings.openai_api_key.get_secret_value().strip()
        self.client = client or (openai.OpenAI(
            api_key=key, timeout=settings.llm_timeout_seconds, max_retries=0
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
            raise AppError("LLM_NOT_CONFIGURED", ".env에 OPENAI_API_KEY를 설정해 주세요.", 503)
        content = [{"type": "input_text", "text": payload}]
        if image is not None:
            encoded = base64.b64encode(image).decode("ascii")
            content.append({"type": "input_image", "image_url": f"data:image/png;base64,{encoded}"})
        for attempt in range(self.settings.llm_max_retries + 1):
            try:
                response = self.client.responses.parse(
                    model=self.settings.openai_model,
                    instructions=instructions,
                    input=[{"role": "user", "content": content}],
                    text_format=schema,
                    max_output_tokens=self.settings.llm_max_output_tokens,
                    store=False,
                )
                self._log_usage(response, request_id, attempt + 1)
                refused = any(
                    getattr(part, "type", None) == "refusal"
                    for item in response.output
                    for part in getattr(item, "content", [])
                )
                if refused:
                    raise AppError("LLM_REFUSED", "AI가 해당 입력 분석을 거절했습니다.", 502)
                if response.status != "completed" or response.output_parsed is None:
                    raise AppError("LLM_INCOMPLETE", "AI 응답이 완료되지 않았습니다. 다시 시도해 주세요.", 502)
                return schema.model_validate(response.output_parsed)
            except openai.APITimeoutError:
                error = AppError("LLM_TIMEOUT", "AI 응답 시간이 초과되었습니다.", 504)
            except openai.APIConnectionError:
                error = AppError("LLM_UNAVAILABLE", "AI 서비스에 연결할 수 없습니다.", 502)
            except openai.APIStatusError as exc:
                if exc.status_code not in (408, 409, 429) and exc.status_code < 500:
                    raise AppError("LLM_REQUEST_REJECTED", "AI 요청 설정 또는 API 사용 권한을 확인해 주세요.", 502) from None
                code = "LLM_RATE_LIMIT" if exc.status_code == 429 else "LLM_UNAVAILABLE"
                error = AppError(code, "AI 서비스가 일시적으로 요청을 처리하지 못했습니다.", 502)
            except ValidationError:
                error = AppError("LLM_INVALID_RESPONSE", "AI 응답이 결과 형식과 일치하지 않습니다.", 502)
            # Never log raw exceptions: provider errors may contain document text or credentials.
            logger.warning("llm_retry request_id=%s attempt=%s code=%s", request_id, attempt + 1, error.code)
            if attempt == self.settings.llm_max_retries:
                raise error from None
            self.sleep(min(2 ** attempt, 4) + random.random() * 0.25)
        raise AssertionError("unreachable")

    def _log_usage(self, response, request_id: str, attempt: int) -> None:
        usage = response.usage
        input_tokens = usage.input_tokens if usage else None
        output_tokens = usage.output_tokens if usage else None
        estimated_cost = None
        if (usage and self.settings.llm_input_price_per_million is not None
                and self.settings.llm_output_price_per_million is not None):
            # Upper estimate: cached input is not discounted here.
            estimated_cost = (input_tokens * self.settings.llm_input_price_per_million
                              + output_tokens * self.settings.llm_output_price_per_million) / 1_000_000
        logger.info(json.dumps({
            "event": "llm_usage", "request_id": request_id, "attempt": attempt,
            "model": response.model, "input_tokens": input_tokens,
            "output_tokens": output_tokens, "estimated_cost_usd": estimated_cost,
        }))
