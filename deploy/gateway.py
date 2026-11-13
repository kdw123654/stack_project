"""Render 한 서비스에 A(AI)·B(백엔드)를 같이 올리기 위한 앞단 게이트웨이.

로컬 vite 프록시와 똑같이 경로로 나눠요.
  /backend-api/...  → B (server/, 127.0.0.1:8001)
  /ai-api/...       → A (루트 app/, 127.0.0.1:8000)
CORS는 여기서 한 번만 처리하고, 뒤 서버가 붙인 CORS 헤더는 지워요(중복 방지).
"""
import os

import httpx
from starlette.applications import Starlette
from starlette.background import BackgroundTask
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route

UPSTREAMS = {
    "backend-api": os.getenv("B_UPSTREAM", "http://127.0.0.1:8001"),
    "ai-api": os.getenv("A_UPSTREAM", "http://127.0.0.1:8000"),
}
HOP = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade",
       "proxy-authorization", "proxy-authenticate"}
ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

client = httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10))


async def proxy(request: Request):
    base = UPSTREAMS.get(request.path_params["prefix"])
    if base is None:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    url = f"{base}/{request.path_params['path']}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP | {"host"}}
    upstream = client.build_request(request.method, url, params=request.query_params, headers=headers,
                                    content=request.stream())
    try:
        resp = await client.send(upstream, stream=True)
    except httpx.HTTPError:
        return JSONResponse({"success": False, "error": {"code": "UPSTREAM_DOWN",
                             "message": "서버가 준비 중이에요. 잠시 후 다시 시도해 주세요."}}, status_code=502)
    out = {k: v for k, v in resp.headers.items()
           if k.lower() not in HOP and not k.lower().startswith("access-control-")}
    return StreamingResponse(resp.aiter_raw(), status_code=resp.status_code, headers=out,
                             background=BackgroundTask(resp.aclose))


async def health(_: Request):
    """Render 헬스 체크: A·B 둘 다 살아 있어야 ok (하나라도 죽으면 Render가 재시작)."""
    status = {}
    for name, base in UPSTREAMS.items():
        try:
            status[name] = (await client.get(f"{base}/health", timeout=5)).status_code == 200
        except httpx.HTTPError:
            status[name] = False
    return JSONResponse(status, status_code=200 if all(status.values()) else 503)


app = Starlette(
    routes=[
        Route("/health", health),
        Route("/{prefix}/{path:path}", proxy, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
    ],
    middleware=[Middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=True,
                           allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])],
)
