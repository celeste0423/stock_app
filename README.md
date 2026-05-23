# 주식 분석 대시보드

Python 백엔드와 React 프런트엔드로 구성된 실행형 웹 프로그램입니다.

## 현재 구현된 페이지

1. `비중_데일리.xlsx`의 `주식비중` 시트를 읽어 시초가 체결 기준 백테스트를 수행하고 수익률 차트와 일자별 기여도를 표시
2. `D:\Study\주식_데일리`의 최신 `데일리_기업스크리닝` 파일에서 상위 50개를 추려 테마별 주도주 정리
3. 이후 페이지 추가를 위한 확장 페이지
4. 텔레그램 내 계정 검색기 페이지

## 실행 방법

가장 간편한 방법은 [Open Stock Dashboard.vbs](D:/Study/New%20Folder/Open%20Stock%20Dashboard.vbs) 또는 [Start Stock Dashboard.bat](D:/Study/New%20Folder/Start%20Stock%20Dashboard.bat)를 더블클릭하는 것입니다.

콘솔창 없이 백그라운드에서 서버를 확인하고, 필요하면 자동으로 실행한 뒤 브라우저를 엽니다.

PowerShell에서 직접 실행하려면 아래 명령을 사용할 수도 있습니다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start_app.ps1
```

브라우저가 자동으로 열리고 `http://127.0.0.1:8123` 에서 화면을 확인할 수 있습니다.

## 메모

- 포트폴리오 가격 데이터는 `FinanceDataReader`를 사용합니다.
- 공시 데이터는 `OpenDartReader`를 사용하며, 현재 `backend/local_settings.json`에 DART API 키가 설정되어 있습니다.
- 엑셀 원본이 열려 있어도 읽을 수 있도록 임시 파일로 복사 후 분석합니다.
- 서버를 끄고 싶으면 `Stop Stock Dashboard.bat` 또는 `stop_app.ps1`를 실행하면 됩니다.
- 텔레그램 검색기는 `Telegram API ID`, `API Hash`, `전화번호`가 필요하며, 페이지 안에서 인증 코드를 받아 로그인할 수 있습니다.
