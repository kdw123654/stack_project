#!/usr/bin/env bash
# Render 한 서비스에서 A(AI)·B(백엔드)·게이트웨이를 같이 실행해요. 저장소 루트에서 실행.
set -euo pipefail

# A: 루트 app/ (AI 서버)
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
# B: server/app/ (Supabase 백엔드) — 패키지 이름이 둘 다 app이라 폴더를 옮겨서 실행
(cd server && exec uvicorn app.main:app --host 127.0.0.1 --port 8001) &

# 게이트웨이: Render가 주는 $PORT로 바깥 요청을 받아 경로별로 A·B에 넘겨요
exec uvicorn deploy.gateway:app --host 0.0.0.0 --port "${PORT:-10000}"
