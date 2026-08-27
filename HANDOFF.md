# Stock App Handoff

## 시작 위치

- 실행: `실행하기.vbs`
- 백엔드 진입점: `launchers_internal/backend_desktop_server.py`
- 앱 진입점: `backend/app.py`
- 프론트엔드 빌드: `tools/build_frontend.ps1`
- 기본 주소: `http://127.0.0.1:8124`

## 코드 구조

- `frontend/static/core/`: 공통 앱 셸, API, UI 기반
- `frontend/static/features/`: 페이지별 기능 모듈
- `frontend/src/`: Vite 진입점과 신규 React 컴포넌트
- `backend/api/`: API 도메인 분류
- `backend/core/`: 백엔드 시작과 호환 로더
- `backend/features/`: 소스로 분리된 백엔드 기능
- `backend/legacy/`: 기존 Python 3.12 호환 런타임
- `tools/`: SQL 데이터 생성과 운영 도구

## 데이터 구조

- `config/screening/`: 한국/미국/아시아 스크리닝 점수 설정
- `backend/*stock_daily_fast.sqlite`: 앱이 조회하는 시장별 스크리닝 DB
- `data/real-estate/`: 건물 관리와 은행 입출금 원본
- `archive/`: 실행에 사용하지 않는 과거 백업
- `outputs/`: 재생성 가능한 결과

앱 관련 데이터는 프로젝트 밖의 `D:\Study`에 두지 않는다. 자세한 보존 규칙은
`docs/DATA_LAYOUT.md`, 개발 규칙은 `WORKFLOW.md`, 리팩터링 상태는
`docs/REFACTORING_PLAN.md`를 참고한다.

## 검증

```powershell
.\tools\check_frontend.ps1
```

백엔드는 프로젝트의 Python 3.12 런타임으로 검증한다. 새 기능은
`backend/features/<domain>/`에 추가하고 의도하지 않은 OpenAPI 변경이 없는지
확인한다.
