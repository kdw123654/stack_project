from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: SecretStr = SecretStr("")
    openai_model: str = "gpt-4.1-mini"
    llm_timeout_seconds: float = Field(default=45, gt=0, le=120)
    llm_max_retries: int = Field(default=2, ge=0, le=3)
    llm_max_output_tokens: int = Field(default=8000, ge=500, le=32000)
    llm_input_price_per_million: float | None = Field(default=None, ge=0)
    llm_output_price_per_million: float | None = Field(default=None, ge=0)
    job_workers: int = Field(default=2, ge=1, le=4)
    job_capacity: int = Field(default=4, ge=1, le=16)
    job_ttl_seconds: int = Field(default=3600, ge=1)
    job_max_records: int = Field(default=100, ge=1)
    max_context_characters: int = Field(default=80000, ge=100, le=200000)
    ocr_enabled: bool = True
    ocr_max_pages_per_file: int = Field(default=10, ge=1, le=50)
    document_converter: str = ""
    job_store_path: str = "data/jobs.sqlite3"
