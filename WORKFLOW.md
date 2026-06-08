# Stock App Workflow

이 저장소에서 작업할 때 기본 규칙은 아래 순서를 따른다.

## 1. 수정 시작 전

1. `git status --short` 로 현재 변경 상태를 먼저 확인한다.
2. 위험도가 있는 수정 전에는 `tools/pre_change_checkpoint.ps1` 를 먼저 실행한다.
3. 백업이 필요한 파일은 스크립트 인자로 넘겨 `.codex_backups/` 아래에 저장한다.
4. 다른 사람이 만든 변경은 되돌리지 않고, 현재 작업과 충돌하는 부분만 조심해서 이어서 수정한다.

예시:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\pre_change_checkpoint.ps1 `
  -BackupPaths backend\app.py, frontend\static\app.js, frontend\static\styles.css
```

## 2. 수정 중

1. 수정은 가능한 한 작은 단위로 나눈다.
2. 인코딩이 중요한 파일은 UTF-8 기준으로 유지한다.
3. 대규모 치환 전에는 먼저 대상 범위를 확인하고 백업을 만든다.
4. 점수 계산, 캐시, 날짜 로직을 건드렸으면 관련 SQL/캐시 반영 여부까지 같이 본다.

## 3. 수정 후

1. 관련 스크립트나 API를 직접 실행해 결과를 검증한다.
2. 서버가 필요한 변경이면 재시작 후 실제 응답을 다시 확인한다.
3. `git diff --stat` 와 `git status --short` 로 바뀐 범위를 마지막에 점검한다.

## 4. Git 체크포인트 권장

중요한 수정 전후에는 최소한 아래 둘 중 하나를 한다.

1. 로컬 커밋 생성
2. 원격 저장소에 푸시

푸시 전 최소 확인 항목:

- 최신 서버 기동 여부
- 주요 API 응답 확인
- 한글 인코딩 이상 여부
- 캐시/DB 생성물이 의도한 파일인지 확인

## 5. 특히 조심할 영역

- `backend/app.py`
- `frontend/static/app.js`
- `frontend/static/styles.css`
- `tools/build_*`
- `tools/recalc_*`

이 파일들은 수정 전 체크포인트를 기본으로 잡는다.
