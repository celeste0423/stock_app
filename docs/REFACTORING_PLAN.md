# 점진적 리팩터링 설계안

## 목표

- 페이지 기능을 `frontend/static/features/<feature>/` 단위로 분리한다.
- 공용 코드와 페이지 전용 코드를 구분해 한 페이지의 변경이 다른 페이지에 전파되는 범위를 줄인다.
- URL, API 경로, 로컬 저장소 키와 사용자 동작은 리팩터링 전후에 유지한다.
- 한 번에 한 기능만 이동하고 각 단계마다 실행 검증과 복구 지점을 만든다.

## 목표 구조

```text
frontend/static/
  core/                  # 앱 셸, 라우팅, 전역 이벤트
  shared/                # 여러 기능이 실제로 함께 쓰는 UI와 유틸리티
  features/
    <feature>/
      page.js             # 페이지 조립과 화면 상태
      api.js              # 해당 기능의 API 호출
      state.js            # 저장 상태와 변환 규칙

backend/
  api/                    # HTTP 요청과 응답 형식
  services/               # 업무 규칙과 외부 연동
  repositories/           # DB와 파일 접근
  shared/                 # 공통 설정과 기반 코드
```

파일 수가 적은 기능은 처음부터 `api.js`와 `state.js`를 억지로 만들지 않고 `page.js` 하나로 시작한다.

## 단계별 순서

1. 현재 상태를 Git 커밋으로 보존하고 핵심 화면의 기준 동작을 기록한다.
2. `features/` 골격을 만들고 독립성이 높은 `naver-blog` 페이지를 먼저 이동한다.
3. 새 모듈을 실제 라우터에 연결하되 첫 단계에서는 기존 구현을 폴백으로 유지한다.
4. 화면과 API 회귀 검증 후 기존 `naver-blog` 구현을 제거한다.
5. 같은 방식으로 `building-management`, `global-company`, `portfolio`를 순서대로 이동한다.
6. 세 페이지 이상에서 확인된 중복만 `shared/`로 이동한다.
7. 프런트엔드 경계가 안정된 뒤 백엔드를 도메인별 `api`, `services`, `repositories`로 분리한다.

## 모듈 계약

- 기능 모듈은 `window.StockAppModules.<feature>`에 공개한다.
- 페이지는 `createPage(dependencies)`로 생성하며 React, API 함수, 공용 컴포넌트를 명시적으로 전달받는다.
- 기능 모듈은 다른 기능 폴더를 직접 참조하지 않는다.
- 기존 API URL, 이벤트 이름과 로컬 저장소 키는 별도 마이그레이션 없이 변경하지 않는다.

## 단계 완료 기준

- `tools/check_frontend.ps1` 구문 및 인코딩 검사를 통과한다.
- 앱 시작, 메뉴 이동, 새로고침과 마지막 페이지 복원이 정상이다.
- 대상 페이지의 조회, 선택, 검색, 새로고침과 오류 표시가 기존과 같다.
- 공개 웹 잠금 처리와 로컬 전용 기능 구분이 유지된다.
- 브라우저 콘솔에 새 오류가 없다.
- 각 기능 이동은 독립 커밋으로 남겨 단계 단위로 되돌릴 수 있다.

## 현재 진행 상태

- 프런트엔드 활성 페이지는 `frontend/static/features/<feature>/page.js`로 분리했다.
- 앱 기반 파일은 `frontend/static/core/shared.js`, `api.js`, `app-shell.js`로 분리했다.
- 구형 중복 라우터와 사용되지 않는 페이지 구현을 제거했다.
- 각 배치는 정적 검사와 실제 브라우저 메뉴 순회 검증 후 별도 커밋으로 저장했다.
- 다음 단계는 백엔드의 도메인별 API, 서비스, 저장소 경계를 만드는 작업이다.
