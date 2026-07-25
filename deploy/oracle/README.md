# Oracle Free Tier Deployment

이 폴더는 GitHub Actions 방식이 아니라 Oracle 서버에서 상시 실행되는 방식의 템플릿입니다.

## 구성

- `stock-app.service`: 현재 주식 앱 FastAPI 서버
- `stock-leader-bot.service`: 텔레그램 명령 응답 봇
- `stock-refresh-kr.service/timer`: 국내 주도주 장마감 후 갱신 예시
- `stock-refresh-us.service/timer`: 미국 주도주 장마감 후 갱신 예시

## 서버 배치 예시

```bash
sudo mkdir -p /opt/stock-app
sudo chown -R $USER:$USER /opt/stock-app
git clone <your-repo-url> /opt/stock-app
cd /opt/stock-app
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Windows에서 한 번에 업로드하려면:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Study\stock app\tools\deploy_oracle_server.ps1" -HostIp ORACLE_PUBLIC_IP
```

이 스크립트는 코드 업로드와 서버 기본 설치까지 진행합니다. 이후 서버의 `/opt/stock-app/.env`만 채우면 됩니다.

## 환경 변수

`/opt/stock-app/.env` 파일을 만들고 아래처럼 설정합니다.

```bash
TELEGRAM_BOT_TOKEN=123456:telegram-token
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890
STOCK_APP_API_URL=http://127.0.0.1:8124
STOCK_BOT_STATE_DIR=/opt/stock-app/.alert_state
STOCK_BOT_RECALCULATE_ON_QUERY=1
ORACLE_SCORE_SYNC_TOKEN=long-random-secret-token
STOCK_DASHBOARD_SCREENING_SQL_ONLY=1
```

`TELEGRAM_ALLOWED_CHAT_IDS`에는 봇이 답장할 단체방 chat id를 넣습니다. 여러 개면 쉼표로 구분합니다.
`STOCK_BOT_RECALCULATE_ON_QUERY=1`이면 `/kr`, `/us` 같은 조회 명령마다 먼저 서버 안에서 당일 데이터를 현재 점수 공식으로 다시 계산한 뒤 결과를 보냅니다.
`ORACLE_SCORE_SYNC_TOKEN`은 로컬 PC에서 Oracle 서버로 점수 공식을 업로드할 때 쓰는 공유 토큰입니다.

로컬 PC의 앱에도 아래 환경변수를 설정해야 점수 지표 팝업의 `Oracle 공식 업데이트` 버튼이 동작합니다.

```bash
ORACLE_STOCK_APP_URL=http://ORACLE_PUBLIC_IP:8124
ORACLE_SCORE_SYNC_TOKEN=long-random-secret-token
```

서버를 외부에 노출하지 않고 SSH 터널로만 업데이트하려면 로컬에서 터널을 연 뒤 `ORACLE_STOCK_APP_URL=http://127.0.0.1:18124`처럼 설정할 수 있습니다.

단체방 chat id 확인:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
```

봇을 단체방에 초대한 뒤 아무 메시지나 보낸 다음 위 명령을 실행하면 `chat.id`가 나옵니다. 단체방 id는 보통 `-100...` 형태입니다.

## systemd 설치

```bash
sudo cp deploy/oracle/*.service deploy/oracle/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stock-app.service
sudo systemctl enable --now stock-leader-bot.service
sudo systemctl enable --now stock-refresh-kr.timer
sudo systemctl enable --now stock-refresh-us.timer
```

로그 확인:

```bash
journalctl -u stock-app.service -f
journalctl -u stock-leader-bot.service -f
```

## 텔레그램 명령

```text
/help
/kr
/kr 100
/kr100
/kr52w
/us
/us 80
/us100
/us52w
/reload_kr
/reload_us
```

일본/중국/대만도 서버에 데이터가 준비되어 있으면 `/jp`, `/cn`, `/tw` 명령으로 같은 방식으로 조회할 수 있습니다.
