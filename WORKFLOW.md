# Workflow

이 저장소에서 작업할 때는 아래 규칙을 기본으로 사용한다.

1. 수정 전 확인
   - `git status --short`
   - `git branch --show-current`
   - `git remote -v`

2. 파이썬 버전
   - 로컬 검증은 Python 3.12 기준으로 진행한다.
   - `backend/vendor` 바이너리 의존성이 있어 Python 3.14로 직접 실행하지 않는다.

3. 인코딩
   - 텍스트 파일은 UTF-8로 저장한다.
   - 한글 문자열이 많은 파일은 수정 후 즉시 재열람해서 깨짐 여부를 확인한다.

4. 검증
   - 가능한 경우 수정 파일에 대해 즉시 구문 검증을 수행한다.
   - 백엔드 실행이 필요한 경우 Python 3.12 환경에서 확인한다.

5. GitHub 백업
   - 의미 있는 단위로 `git add` 후 커밋한다.
   - 작업 마무리 시 `git push origin main`으로 원격 백업 상태를 유지한다.
   - 대규모 문자열/인코딩 수정 전에는 중간 커밋을 우선 만든다.

6. GitHub Actions
   - 자동화 스크립트는 가능한 한 로컬 절대경로를 사용하지 않는다.
   - 시크릿은 GitHub Secrets 또는 `backend/local_settings.json` 기반으로만 읽는다.
