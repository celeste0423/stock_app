# 주식 분석 대시보드

Python 백엔드와 React 프런트엔드로 구성된 로컬 주식 분석 애플리케이션입니다.

## 실행

프로젝트 루트의 `실행하기.vbs`를 실행합니다. 이 파일은
`launchers_internal/start_desktop_app.ps1`을 호출해 로컬 서버를 확인하거나 시작하고,
전용 Edge 앱 창을 엽니다.

- 기본 주소: `http://127.0.0.1:8124`
- 백엔드 진입점: `launchers_internal/backend_desktop_server.py`

## 주요 디렉터리

- `backend/`: API, 데이터베이스, 계산 결과와 런타임 데이터
- `frontend/`: React 화면과 정적 자산
- `tools/`: 데이터 생성, 점수 재계산, 배포·운영 도구
- `launchers_internal/`: 로컬 앱 실행과 재시작 스크립트
- `deploy/`: Oracle 서버 배포 파일

캐시, SQLite 데이터베이스, 세션과 로컬 설정은 실행 성능 및 사용자 상태에 필요하므로
소스 정리 과정에서 삭제하지 않습니다.
