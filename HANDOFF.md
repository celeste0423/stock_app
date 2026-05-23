# Stock Dashboard 인수인계 문서

마지막 정리일: 2026-05-24  
프로젝트 위치: `D:\Study\stock app`  
로컬 앱 주소: `http://127.0.0.1:8124`

이 문서는 Codex 계정을 바꾸거나 새 대화에서 이어 개발할 때 처음 읽으면 되는 인수인계 문서다. 새 Codex에게는 먼저 이 파일을 읽게 한 뒤, 필요한 경우 `backend\app.py`, `frontend\static\app.js`, `frontend\static\styles.css`를 확인시키면 된다.

## 1. 한 줄 요약

이 앱은 Python FastAPI 백엔드와 React 단일 파일 프론트엔드로 만든 로컬 투자/부동산 대시보드다. 주식 포트폴리오 수익, 오늘의 주도주, 섹터 진입 신호, 전략 백테스트, 종목 정보/텔레그램 검색, 공시/실적, 뉴스, 해외기업, 글로벌 지수/가격동향, 수출입, 경기순환, 부동산 가격, 건물 관리 등을 한 앱에서 본다.

## 2. 실행 방법

가장 일반적인 실행:

```text
D:\Study\stock app\실행하기.vbs
```

공유 모드 실행:

```text
D:\Study\stock app\공유모드 실행하기.cmd
```

직접 서버 재시작이 필요할 때:

```powershell
$root='D:\Study\stock app'
Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^pythonw?(\.exe)?$' -and $_.CommandLine -like '*backend_desktop_server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800
$env:PYTHONPATH = "$root;$root\backend\vendor"
$env:STOCK_DASHBOARD_DESKTOP_PORT='8124'
Start-Process -FilePath 'C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -ArgumentList '"D:\Study\stock app\launchers_internal\backend_desktop_server.py"' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$root\desktop_stdout.log" -RedirectStandardError "$root\desktop_stderr.log"
Start-Sleep -Seconds 4
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8124/api/app-config' -TimeoutSec 10
```

로그:

```text
D:\Study\stock app\desktop_stdout.log
D:\Study\stock app\desktop_stderr.log
D:\Study\stock app\launcher.log
D:\Study\stock app\desktop_app.log
```

## 3. 주요 파일

```text
D:\Study\stock app\backend\app.py
D:\Study\stock app\frontend\static\app.js
D:\Study\stock app\frontend\static\styles.css
D:\Study\stock app\launchers_internal\backend_desktop_server.py
D:\Study\stock app\launchers_internal\start_desktop_app.ps1
D:\Study\stock app\requirements.txt
```

현재 구조는 빌드 도구 없이 `app.js`와 `styles.css`를 직접 수정하는 방식이다. 프론트엔드는 React를 CDN/정적 파일 방식으로 쓰는 단일 JS 파일에 가깝고, 백엔드는 `backend\app.py` 하나에 대부분의 API와 계산 로직이 들어 있다.

## 4. 검증 명령

프론트 문법 체크:

```powershell
& 'C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check 'D:\Study\stock app\frontend\static\app.js'
```

백엔드 문법 체크:

```powershell
$env:PYTHONPYCACHEPREFIX='D:\Study\stock app\.pycache_check'
& 'C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m py_compile 'D:\Study\stock app\backend\app.py'
```

앱 응답 확인:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8124/api/app-config' -TimeoutSec 10
```

## 5. 데이터와 상태 저장 위치

앱의 상태 데이터는 대부분 `D:\Study\stock app\backend` 아래 JSON/cache 파일로 저장된다.

중요 상태 파일:

```text
D:\Study\stock app\backend\local_settings.json
D:\Study\stock app\backend\sector_database.json
D:\Study\stock app\backend\screening_cache.json
D:\Study\stock app\backend\real_estate_building.json
D:\Study\stock app\backend\market_calendar_events.json
D:\Study\stock app\backend\trade_import_export_cache.json
D:\Study\stock app\backend\trade_snapshot_history.json
D:\Study\stock app\backend\dram_price_history.json
D:\Study\stock app\backend\ssd_price_history.json
D:\Study\stock app\backend\economy_cycle_clock_cache.json
D:\Study\stock app\backend\real_estate_price_cache.json
D:\Study\stock app\backend\real_estate_trade_cache.json
D:\Study\stock app\backend\kis_token_cache.json
D:\Study\stock app\backend\telegram_session
```

외부 원본 데이터 폴더:

```text
D:\Study\주식_데일리
D:\Study\상가_관리_데이터
C:\Users\jyeob\OneDrive - SK Hynix Inc\Cloud\투자\주식\비중_데일리 엑셀파일
```

주의: `backend\local_settings.json`, `backend\kis_token_cache.json`, `backend\telegram_session`에는 민감정보 또는 로그인 세션이 포함될 수 있다. GitHub나 외부 공유에 절대 올리지 말 것.

## 6. 민감정보 처리 원칙

이 프로젝트에는 과거 대화에서 DART, 텔레그램, 한국투자증권, 공공데이터포털, R-ONE, 오픈뱅킹 관련 키가 입력된 적이 있다. 새 Codex는 키 원문을 다시 대화에 노출하지 말고, 필요하면 아래 위치나 환경변수를 확인해야 한다.

백엔드는 다음 환경변수 또는 `backend\local_settings.json`에서 값을 읽는다.

```text
DART_API_KEY
KIS_APP_KEY
KIS_APP_SECRET
KIS_ACCOUNT_NO
KIS_ACCOUNT_PRODUCT_CODE
KIS_ENVIRONMENT
STOCK_DASHBOARD_CUSTOMS_API_KEY
CUSTOMS_API_KEY
STOCK_DASHBOARD_DATAGO_API_KEY
DATA_GO_KR_API_KEY
DATAGO_API_KEY
STOCK_DASHBOARD_MOTIE_TRADE_API_KEY
MOTIE_TRADE_API_KEY
STOCK_DASHBOARD_R_ONE_API_KEY
STOCK_DASHBOARD_MOLIT_APT_TRADE_API_KEY
```

새 계정에서 작업할 때는 API 키를 코드에 직접 박지 말고 기존 설정 파일 또는 환경변수 방식을 유지한다. 특히 한국투자증권 실제 계좌 키는 주문 기능 구현 시 실수 주문 위험이 있으므로 읽기 기능과 모의투자 기능을 명확히 분리해야 한다.

## 7. 현재 페이지 구성

주식 탭 주요 페이지:

```text
관심종목 보드
오늘의 주도주
종목 정보 검색기
공시/실적
뉴스 검색기
해외기업 검색기
글로벌 지수 / 지수·가격동향
섹터 진입 신호
섹터 비교 테이블
포트폴리오 수익
전략 백테스트
증시 일정
수출입
경기순환
추가 예정 페이지
```

부동산 탭 주요 페이지:

```text
부동산 가격
건물 관리
```

프론트 페이지 함수 위치는 `frontend\static\app.js` 안의 다음 함수들을 보면 된다.

```text
SectorWatchBoardPage
PortfolioPage
StrategyBacktestPage
DisclosurePage
TelegramPage
StockNewsPage
GlobalCompanyPage
GlobalIndicesPage
SectorEntrySignalPage
SectorSnapshotPageV2
ThemesPageV2
MarketCalendarPage
TradeImportExportPage
EconomyCycleClockPage
RealEstatePricePage
BuildingManagementPage
```

## 8. 주요 API 엔드포인트

백엔드 엔드포인트는 `backend\app.py` 하단에 몰려 있다.

대표 API:

```text
GET  /api/app-config
GET  /api/portfolio/performance
GET  /api/portfolio/export.xlsx
GET  /api/strategy/backtest
GET  /api/strategy/sector-rotation
GET  /api/strategy/advanced-sector
GET  /api/strategy/portfolio-diagnostic
GET  /api/themes/today
POST /api/themes/reload
POST /api/themes/note
GET  /api/themes/score-history
GET  /api/stocks/autocomplete
GET  /api/stocks/chart-preview
POST /api/themes/sector-market-cap-chart
GET  /api/sector-watch-board
POST /api/sector-watch-board/order
GET  /api/sector-db
POST /api/sector-db/assign
GET  /api/sector-snapshot/entry-signals
GET  /api/trade/import-export
GET  /api/dram/prices
GET  /api/ssd/prices
GET  /api/tourism/inbound-visitors
GET  /api/economy/cycle-clock
GET  /api/global-indices
GET  /api/global-stocks/search
GET  /api/global-stocks/detail
GET  /api/market-calendar
POST /api/market-calendar/events
GET  /api/market-calendar.ics
GET  /api/real-estate/prices
GET  /api/real-estate/trade-detail
GET  /api/real-estate/building
POST /api/real-estate/building
POST /api/real-estate/water/sync-telegram
POST /api/real-estate/electricity/sync-telegram
POST /api/real-estate/bank/import-files
GET  /api/telegram/status
POST /api/telegram/search
POST /api/telegram/search_jobs
GET  /api/telegram/search_jobs/{job_id}
POST /api/telegram/search_jobs/{job_id}/cancel
POST /api/telegram/earnings_search
POST /api/telegram/earnings_search_jobs
GET  /api/telegram/earnings_search_jobs/{job_id}
POST /api/telegram/earnings_search_jobs/{job_id}/cancel
GET  /api/dart/earnings-trend
GET  /api/kind/latest-business-report
POST /api/telegram/market_earnings
```

## 9. 최근 작업 맥락

최근에 집중한 영역은 전략 백테스트와 투자 방식 진단이다.

전략 백테스트 쪽:

```text
- 고급 섹터 전략에서 섹터 진입 신호 기반 백테스트를 지원한다.
- 종목 선별은 기존 점수순과 추세 강도 우선 방식이 있다.
- 편입/편출 로그에서 단순 비중 변화보다 해당 종목 매매 수익률을 볼 수 있도록 개선했다.
- 로그의 종목명을 누르면 매수/매도 지점이 표시된 미니 차트 팝업이 뜬다.
- 비교군으로 포트폴리오 수익 페이지의 실제 투자 성과와도 비교하는 방향을 추가/확장 중이다.
```

현재 방식 진단 모드:

```text
- /api/strategy/portfolio-diagnostic 에서 실제 포트폴리오와 여러 개선 시나리오를 비교한다.
- 사후 꼬리 제거, 실전 꼬리룰 현금화, 실전 꼬리룰 지수 대체, 시장 필터, 섹터 게이트, 통합 시나리오가 있다.
- 실전 꼬리룰은 당시에 알 수 있었던 데이터만으로 판단하려는 목적이다.
- 현재 실전 꼬리룰은 아직 너무 보수적이라 실제 성과가 나쁘게 나올 수 있다.
- 다음 개선 방향은 "신규 편입 종목에는 엄격한 꼬리룰", "이미 수익 버퍼가 있는 보유 주도주는 느슨한 청산룰"로 분리하는 것이다.
```

섹터 진입 신호:

```text
- 섹터별 점수, 20일선 위 종목 비율, 이격도, 시장 상태, 베타 등을 조합해 진입 신호를 표현한다.
- 오늘의 주도주 페이지에서도 진입 신호 섹터/종목을 색으로 표시한다.
- 차트 팝업에서는 과거 진입 신호 지점을 초록 점으로 표시한다.
- 베타는 FinanceDataReader 가격 데이터로 계산한다. 기간은 3개월/1년 선택을 지원한다.
```

증시 일정:

```text
- 전략 백테스트 아래 "증시 일정" 페이지가 있다.
- 월간 캘린더 UI, 일정 직접 추가, ICS 다운로드를 지원한다.
- 데이터는 backend\market_calendar_events.json 에 저장된다.
- Google Calendar 완전 OAuth 동기화는 아직 아니고, 현재는 ICS 구독/다운로드 방식이다.
```

## 10. 자주 발생했던 문제와 대응

앱 빈 화면:

```text
- 대부분 app.js 문법 오류 또는 React 런타임 오류다.
- 먼저 node --check app.js 를 실행한다.
- 브라우저 콘솔의 ReferenceError를 보고 누락 함수/상수를 복구한다.
```

failed to fetch:

```text
- 백엔드 서버가 꺼졌거나 포트가 꼬였을 가능성이 높다.
- backend_desktop_server.py 프로세스를 종료 후 재시작한다.
- /api/app-config 응답을 확인한다.
```

텔레그램 검색:

```text
- Telethon 세션 DB lock 문제가 있었고, 세션 복사 방식과 lock을 사용한다.
- 검색 작업은 job 방식으로 진행되며 취소 API가 있다.
- 영어+한글 혼합 검색어는 normalize_search_text, prefix alias, 검색어 변형 생성 로직을 확인해야 한다.
```

엑셀 손상:

```text
- 과거 openpyxl로 xlsm을 잘못 저장해 Excel 파일이 손상된 적이 있다.
- 매크로 포함 파일은 저장 방식에 특히 주의한다.
- 원본 엑셀을 직접 수정할 때는 백업 후 작업하고, 가능하면 Excel COM 또는 안전 복사본을 사용한다.
```

한글 깨짐:

```text
- PowerShell 출력은 깨져 보일 수 있지만 앱은 UTF-8로 정상 렌더링되는 경우가 많다.
- JSON/JS/PY 파일은 UTF-8 저장을 유지한다.
```

Git:

```text
- 현재 D:\Study\stock app 은 Git 저장소가 아니다.
- git 명령은 설치되어 있고, C:\Users\jyeob\.local\bin\git.cmd 경로에 shim이 있다.
- Git 저장소를 만들 경우 local_settings.json, telegram_session, token/cache, 엑셀 원본, 로그, outputs는 반드시 제외한다.
```

## 11. 개발 원칙

```text
- 사용자가 요청하면 설명만 하지 말고 가능한 한 직접 구현한다.
- 파일 수정은 apply_patch를 사용한다.
- 기존 사용자 데이터와 DB를 임의로 초기화하지 않는다.
- 엑셀 원본을 수정하는 기능은 항상 백업/복구 가능성을 먼저 확인한다.
- 민감한 키나 계좌정보는 코드와 문서에 원문으로 남기지 않는다.
- 프론트 수정 후 node --check, 백엔드 수정 후 py_compile을 실행한다.
- 큰 기능 추가 후에는 가능하면 서버를 재시작하고 /api/app-config를 확인한다.
```

## 12. 새 계정에서 이어받는 첫 요청 예시

새 Codex 계정에서는 아래처럼 요청하면 된다.

```text
D:\Study\stock app\HANDOFF.md 를 먼저 읽고 이 프로젝트를 이어서 개발해줘.
민감정보는 출력하지 말고, 현재 앱 구조와 최근 작업 맥락을 파악한 뒤 내가 요청하는 기능을 구현해줘.
```

## 13. 다음 작업 후보

최근 대화 흐름상 이어질 가능성이 높은 작업:

```text
- 전략 백테스트의 "현재 방식 진단 모드"를 더 현실적으로 개선
- 꼬리 제거 시나리오를 신규 편입 기준/기존 보유 기준으로 분리
- 섹터 진입 신호의 계산식과 중간 점수 UI를 더 명확히 표시
- 포트폴리오 수익 페이지에서 꼬리 종목 손실/주요 섹터 기여도 분석 강화
- 오늘의 주도주와 섹터 진입 신호 차트의 진입점 표시 조정
- 경기순환 페이지의 글로벌 유동성, M2, 하이일드 스프레드 연동 보완
- 증시 일정 데이터 소스 자동화 및 Google Calendar 연동 고도화
- 건물 관리 페이지의 수익/비용 계산과 엑셀 동기화 안정화
```

## 14. 마지막으로 중요한 주의

이 앱은 단순 샘플이 아니라 실제 투자/부동산 관리 데이터와 계좌/텔레그램/공공 API가 얽힌 개인용 도구다. 새 계정에서 작업할 때도 "기능 구현"보다 "데이터 보존"이 우선이다. 특히 `backend\sector_database.json`, `backend\real_estate_building.json`, `backend\local_settings.json`, `backend\telegram_session`은 함부로 지우거나 초기화하지 말 것.
