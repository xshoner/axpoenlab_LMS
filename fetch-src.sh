#!/bin/sh
# Vercel installCommand — 직접 배포(파일 업로드) 시에는 소스 tar.gz를 내려받고,
# Git 연동 빌드처럼 src/ 가 이미 있으면 다운로드를 건너뛴다.
set -e
if [ ! -d src ]; then
  curl -sL "$SRC_TARBALL_URL" | tar xz
fi
npm install
