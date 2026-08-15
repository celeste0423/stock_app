# 주식 분석 대시보드

Python 백엔드와 React 프런트엔드로 구성된 로컬 주식 분석 애플리케이션입니다.

## 실행

프로젝트 루트의 `실행하기.vbs`를 실행합니다. 이 파일은
`launchers_internal/start_desktop_app.ps1`을 호출해 로컬 서버를 확인하거나 시작하고,
전용 Edge 앱 창을 엽니다.

- 기본 주소: `http://127.0.0.1:8124`
- 백엔드 진입점: `launchers_internal/backend_desktop_server.py`

## 주요 디렉터리

- `backend/api/`: API 경로의 도메인 분류와 HTTP 경계
- `backend/core/`: 백엔드 시작과 호환 런타임
- `backend/features/`: 새로 분리된 백엔드 도메인 기능
- `backend/legacy/`: 소스 손상 전 마지막 Python 3.12 호환 런타임
- `data/`: 앱이 직접 읽는 스크리닝·부동산 원본 데이터
- `archive/`: 실행에는 사용하지 않는 과거 데이터·배포 백업
- `frontend/static/core/`: 앱 셸, API 및 공용 런타임
- `frontend/static/features/`: 페이지별 독립 기능 모듈
- `frontend/static/modules/`: 여러 기능이 공유하는 소규모 도메인 헬퍼
- `frontend/vendor/`: 브라우저 벤더 라이브러리
- `tools/`: 데이터 생성, 점수 재계산, 배포·운영 도구
- `launchers_internal/`: 로컬 앱 실행과 재시작 스크립트
- `deploy/`: Oracle 서버 배포 파일

캐시, SQLite 데이터베이스, 세션과 로컬 설정은 실행 성능 및 사용자 상태에 필요하므로
소스 정리 과정에서 삭제하지 않습니다.

백엔드는 Python 3.12로 실행합니다. 기존 거대 `app.py`의 텍스트 인코딩 손상 때문에
검증된 런타임을 `backend/legacy/`에 격리했으며, 새 기능은 `backend/features/`에
소스로 추가해 단계적으로 레거시 의존성을 줄입니다.

데이터 위치와 보존 규칙은 `docs/DATA_LAYOUT.md`를 참고합니다.
