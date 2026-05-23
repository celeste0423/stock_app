# Codex Cloud + Telegram 운영 메모

이 문서는 이 프로젝트를 GitHub 저장소에 올린 뒤 Codex Cloud와 Telegram 알림/명령 브리지를 붙이는 절차다.

## 구조

- Codex Cloud: GitHub 저장소를 읽고 작업별 클라우드 컨테이너에서 코드 변경 후 PR을 만든다.
- GitHub Actions: 이슈, 코멘트, PR, 리뷰 이벤트를 Telegram으로 알린다.
- Telegram GitHub bridge: 항상 켜져 있는 호스트에서 Telegram 명령을 받아 GitHub 이슈를 만들고 `@codex`를 호출한다.

Codex Cloud는 장시간 실행되는 서버가 아니라 작업 단위 컨테이너다. PC가 꺼져 있어도 작업과 알림이 돌아가려면 GitHub Actions 또는 별도 호스팅 서비스가 필요하다.

## 저장소 준비

1. GitHub에 비공개 저장소를 만든다.
2. 이 프로젝트 폴더에서 Git 저장소를 초기화하고 원격 저장소를 연결한다.
3. `.gitignore`가 민감정보를 제외하는지 확인한다.

절대 올리면 안 되는 파일:

- `backend/local_settings.json`
- `backend/kis_token_cache.json`
- `backend/telegram_session/`
- `local_settings.json`
- `outputs/`
- `docs_cache/`
- 각종 `*.log`

## Codex Cloud 연결

공식 문서 기준으로 Codex Cloud는 `chatgpt.com/codex`에서 GitHub 계정을 연결하고, 저장소 접근 권한을 승인한 뒤 작업을 위임한다. 작업을 시작하면 Codex가 작업별 샌드박스 컨테이너를 만들고, 완료 시 PR을 생성한다.

권장 환경 설정:

- 저장소: 이 프로젝트 GitHub repo
- 설치 명령: `pip install -r requirements.txt`
- 검증 명령:
  - `python -m py_compile backend/app.py`
  - `node --check frontend/static/app.js`
- 인터넷 접근: 필요한 도메인만 허용한다. 금융/공시/공공 API 키가 필요한 작업은 먼저 더미/모의 데이터로 작업시킨다.

## Telegram 알림

`.github/workflows/telegram-notify.yml`는 다음 이벤트를 Telegram으로 보낸다.

- Issue 생성/수정/종료
- Issue comment 생성
- Pull request 생성/업데이트/머지
- Pull request review 제출

GitHub 저장소 Settings -> Secrets and variables -> Actions에 아래 Secrets를 추가한다.

- `TELEGRAM_BOT_TOKEN`: BotFather에서 받은 봇 토큰
- `TELEGRAM_CHAT_ID`: 알림 받을 개인 또는 그룹 chat id

## 보유 종목 뉴스 자동 알림

`.github/workflows/portfolio-news-alert.yml`는 30분마다 보유 종목 관련 신규 뉴스를 검색하고, 아직 보낸 적 없는 중요 뉴스만 Telegram으로 보낸다.

GitHub Actions에서 PC 없이 실행하려면 저장소 Secrets에 아래 값을 추가한다.

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `STOCK_ALERT_HOLDINGS_JSON`

초기 설정용 `STOCK_ALERT_HOLDINGS_JSON` 예시:

```json
[
  {"name": "삼성전자", "code": "005930", "weight_pct": 12.5},
  {"name": "SK하이닉스", "code": "000660", "weight_pct": 18.2}
]
```

로컬 PC에서 실행하면 `STOCK_ALERT_HOLDINGS_JSON`이 없어도 포트폴리오 수익 페이지와 같은 데이터에서 최신 보유 종목을 읽으려고 시도한다.

```powershell
python tools\portfolio_news_alert.py --dry-run
python tools\portfolio_news_alert.py
```

현재 포트폴리오 수익 페이지 기준 보유 종목을 GitHub Secret에 넣을 JSON으로 뽑으려면 아래 명령을 사용한다.

```powershell
python tools\export_portfolio_holdings.py
python tools\export_portfolio_holdings.py --output outputs\stock_alert_holdings.json
```

기본값은 마지막 날짜가 전량 현금화 상태일 때 가장 최근의 비어 있지 않은 보유일을 기준으로 출력한다. 반드시 마지막 날짜 그대로만 쓰려면 `--strict-latest`를 붙인다.

수동 업로드를 피하려면 앱의 `포트폴리오 수익` 페이지에서 `보유종목 뉴스 알림 동기화` 패널을 사용한다.

1. GitHub fine-grained token을 만든다.
   - Repository access: 이 저장소만
   - Actions secrets: Read and write
   - Metadata: Read
2. `GitHub repo`에 `celeste0423/stock_app`를 입력한다.
3. token을 입력하고 `설정 저장`을 누른다.
4. `보유종목 Secret 동기화`를 누른다.

이 버튼은 포트폴리오 수익 페이지와 같은 계산으로 최신 보유종목을 추출한 뒤, GitHub Actions Secret `STOCK_ALERT_HOLDINGS_JSON`을 자동 갱신한다. 마지막 날짜가 전량 현금화 상태이면 가장 최근의 비어 있지 않은 보유일 기준으로 동기화한다.

중복 발송 방지는 `.alert_state/portfolio_news_alert_cache.json` 또는 `backend/stock_news_alert_cache.json`에 저장된 뉴스 지문으로 처리한다. GitHub Actions에서는 `.alert_state`를 Actions cache로 이어받는다.

## Telegram에서 Codex 작업 만들기

`tools/telegram_github_bridge.py`는 Telegram 명령을 GitHub Issue로 바꾸는 작은 long-polling 봇이다. PC가 꺼져 있어도 쓰려면 Render, Fly.io, Railway, VPS, NAS, 라즈베리파이 같은 항상 켜진 곳에서 실행한다.

필수 환경변수:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_ID`
- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY`: 예시 `owner/stock-dashboard`

선택 환경변수:

- `CODEX_MENTION`: 기본값 `@codex`
- `GITHUB_DEFAULT_LABELS`: 기본값 `codex-task`

실행:

```powershell
python tools\telegram_github_bridge.py
```

Telegram 명령:

```text
/task 현재 방식 진단 개선 | 신규 편입은 엄격하게, 기존 수익 종목은 느슨하게 처리하도록 개선해줘.
/issue 앱 빈 화면 수정 | app.js 문법 오류를 찾아 고치고 검증 명령을 실행해줘.
/status
```

브리지는 GitHub 이슈 본문 끝에 기본적으로 `@codex 이 작업을 코드 변경 PR로 처리해줘.`를 붙인다. Codex Cloud가 GitHub `@codex` 트리거를 사용할 수 있게 설정되어 있어야 한다.

## GitHub Token 권한

브리지용 GitHub fine-grained token 권장 권한:

- Repository access: 이 저장소만
- Issues: Read and write
- Metadata: Read

PR을 직접 만들 필요는 없다. Codex Cloud가 이슈를 보고 PR을 만든다.

## 보안 원칙

- Telegram 봇은 `TELEGRAM_ALLOWED_CHAT_ID`와 일치하는 채팅만 처리한다.
- 실제 계좌 키, Telegram 세션, 공공 API 키는 GitHub에 커밋하지 않는다.
- Codex Cloud에는 실제 주문 기능 변경을 바로 맡기지 말고 읽기/모의투자 기능부터 검증한다.
- PR은 반드시 diff와 테스트 결과를 확인한 뒤 병합한다.
