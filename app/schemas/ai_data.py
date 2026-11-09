from datetime import datetime
from typing import Annotated

from pydantic import Field, field_validator

from app.schemas.analysis import JobView, StrictModel

JobId = Annotated[str, Field(min_length=1, max_length=128)]


class JobSelection(StrictModel):
    jobIds: list[JobId] = Field(min_length=1, max_length=20)

    @field_validator("jobIds")
    @classmethod
    def unique_nonblank_ids(cls, values):
        values = [value.strip() for value in values]
        if not all(values) or len(set(values)) != len(values):
            raise ValueError("작업 ID는 비어 있거나 중복될 수 없습니다.")
        return values


class DataExportRequest(JobSelection):
    includeImages: bool = False


class ExportedJob(StrictModel):
    job: JobView
    result: dict | None
    versions: list[dict]
    documents: dict[str, dict]
    ocrSources: list[dict]
    assets: list[dict]


class DataExport(StrictModel):
    schemaVersion: str = "1"
    exportedAt: datetime
    imagesIncluded: bool
    records: list[ExportedJob]
    missingJobIds: list[str]


class DataDeletion(StrictModel):
    deletedJobIds: list[str]
    missingJobIds: list[str]
