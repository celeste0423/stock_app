# Stock Dashboard Desktop App

이 폴더는 기존 웹 버전(`D:\Study\New Folder`)을 그대로 복사한 데스크탑 앱 테스트 버전입니다.

## 실행

`00_Run_Stock_App.vbs` 또는 `Open Stock Dashboard App.vbs`를 더블클릭하면 콘솔 창 없이 앱 창이 열립니다.

문제가 생겨 로그를 보고 싶을 때는 `Start Stock Dashboard App.bat`를 실행하면 콘솔 창에서 에러를 확인할 수 있습니다.

앱 실행 로그는 `desktop_app.log`에도 남습니다.

UI가 바뀌었는데 예전 화면이 계속 보이면 `Restart Stock App.bat`를 실행해 기존 앱 프로세스를 종료하고 새로 열 수 있습니다.

내부적으로는 FastAPI 서버를 로컬 포트 `8124`부터 빈 포트에 자동 실행하고, `pywebview` 창으로 화면을 띄웁니다. 기존 웹 버전의 `8123` 서버와 충돌하지 않도록 별도 포트를 사용합니다.

## 개발/수정

웹 버전과 동일하게 `backend/app.py`, `frontend/static/app.js`, `frontend/static/styles.css`를 수정하면 됩니다. exe로 패키징하지 않았기 때문에 수정 후 다시 실행하면 바로 반영됩니다.

## exe 패키징

지금 단계에서는 exe로 묶지 않았습니다. 기능이 안정화된 뒤 필요할 때 PyInstaller 등으로 패키징하면 됩니다.
