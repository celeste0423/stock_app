# 데이터 폴더 구조

앱이 사용하는 데이터는 프로젝트 밖의 `D:\Study`에 두지 않고 모두 이 저장소
루트 아래에서 관리한다. 개인정보와 대용량 파일이 포함되므로 `data/`, `archive/`,
`outputs/`는 Git에 커밋하지 않는다. 스크리닝 설정은 `config/`에서 코드와 함께
관리한다.

```text
data/
  real-estate/     # 건물 관리 원본, 은행 입출금 파일, 내보내기 결과

config/
  screening/       # 시장별 점수 계산 설정 JSON

backend/
  *stock_daily_fast.sqlite  # 앱이 직접 조회하는 시장별 스크리닝 DB

archive/
  screening/       # 과거 스크리닝 백업과 압축 파일
  deploy/          # 과거 서버 배포 압축 파일

outputs/
  legacy-root/     # 과거 D:\Study 루트에 있던 분석 결과
```

## 보존 규칙

- `data/real-estate/`는 부동산 기능이 읽으므로 삭제하거나 이름을 바꾸지 않는다.
- 스크리닝 기능은 과거 `Stock_Daily`, `주식_데일리` Excel 폴더를 사용하지 않는다.
- `config/screening/` 설정 파일은 Git에 포함하고 변경 이력을 남긴다.
- `archive/`는 앱 실행에는 필요 없지만 과거 자료 복구용으로 보존한다.
- `outputs/`는 다시 만들 수 있는 결과물이므로 필요할 때 정리할 수 있다.
- 캐시와 데이터베이스를 정리할 때는 앱을 종료하고 별도 포트 회귀 검사를 먼저 수행한다.
