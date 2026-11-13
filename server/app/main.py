from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from app.common import register_error_handlers
from app.config import CORS_ORIGINS
from app.routers import (admin, auth, competency, cover_letters, experiences, explore, files, home, job_postings,
                         portfolios, users)
app = FastAPI(title="STACK API")

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
register_error_handlers(app)

for r in [admin, auth, users, files, experiences, job_postings, cover_letters, portfolios, explore, home, competency]:
    app.include_router(r.router, prefix="/api/v1")

@app.get("/health")
def health():
    return {"status": "ok"}

def openapi_with_file_picker():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    for model in schema.get("components", {}).get("schemas", {}).values():
        for prop in model.get("properties", {}).values():
            items = prop.get("items",{})
            if items.get('contentMediaType') == 'application/octet-stream':
                del items['contentMediaType']
                items['format'] = 'binary'

    app.openapi_schema = schema
    return schema

app.openapi = openapi_with_file_picker