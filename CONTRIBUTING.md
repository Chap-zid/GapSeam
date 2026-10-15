# 빈틈이음 개발 참여 안내

유휴 공간(공가)의 활용 가능성을 분석하고, 공간이 필요한 이용자와 소유자를 연결하는 서비스입니다.
이 문서만 보고 로컬 개발을 시작할 수 있게 쓰여 있습니다.

- 배포 주소: https://my-web-app--gap-seam.us-east4.hosted.app
- Firebase 프로젝트: `gap-seam` (운영과 개발이 같은 프로젝트입니다 — 아래 주의 참고)

## 1. 처음 받아서 실행하기

```bash
git clone https://github.com/Chap-zid/GapSeam.git
cd GapSeam
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`을 비워둔 채 `NEXT_PUBLIC_DEMO_MODE=true`로 두면 Firebase 없이도 화면이 전부 돌아갑니다.
로컬 `demo-store`가 Firestore 역할을 대신하므로 **처음 둘러볼 때는 이 상태가 가장 편합니다.**

데모 모드에서 안 되는 것: Google 로그인, 두 기기 실시간 동기화, OpenAI 분석, VWorld 조회.

## 2. 환경 변수

`.env.example`이 전체 목록이고, 값은 아래에서 구합니다.

| 변수 | 구하는 곳 | 없으면 |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Console → 프로젝트 설정 → 내 앱(웹) | 로그인·Firestore 불가, 데모 모드로 동작 |
| `NEXT_PUBLIC_DEMO_MODE` | 직접 설정 (`true`/`false`) | `false` 취급 |
| `OPENAI_API_KEY` | 본인 OpenAI 계정에서 발급 | 분석·대화가 규칙 기반 fallback으로 동작 |
| `OPENAI_MODEL` | 기본 `gpt-4.1-mini` | 기본값 사용 |
| `VWORD_API_KEY` | [VWorld](https://www.vworld.kr) 인증키 신청 | 샘플 주변 환경 데이터 사용 |
| `VWORD_DOMAIN` | 로컬은 `localhost` | 요청 도메인 사용 |
| `NEXT_PUBLIC_ONLYOFFICE_URL` | 로컬 Docker ONLYOFFICE | DOCX 고급 편집만 비활성 |

**`NEXT_PUBLIC_` 접두사가 붙은 값은 브라우저에 그대로 노출됩니다.** 서버 전용 키에는 절대 붙이지 마세요.

VWorld 키는 도메인 제한이 걸립니다. 로컬에서 주소 조회를 테스트하려면 본인 키를 발급받아
`localhost`를 등록하는 쪽이 빠릅니다.

### 키를 주고받는 방법

- **저장소, 이슈, PR, 채팅에 키를 붙여넣지 마세요.** `.env*.local`은 `.gitignore`에 있습니다.
- 운영 키는 Google Cloud Secret Manager에만 있습니다. `apphosting.yaml`은 참조만 합니다.
- 공유가 필요하면 1Password 같은 비밀 관리 도구나 별도 보안 채널을 쓰고, 가능하면 **각자 본인 키를 발급**하세요.

## 3. 작업 흐름

```bash
git pull                             # 남이 올린 변경을 먼저 받습니다
npm install                          # 의존성이 바뀌었을 수 있습니다
git switch -c feat/무엇을-하는지     # main에 직접 커밋하지 않습니다
# ... 작업 ...
npm run verify                       # lint + build. 올리기 전에 반드시 통과시킵니다
git push -u origin feat/무엇을-하는지
```

GitHub에서 PR을 올리면 CI가 lint와 빌드를 돌립니다. 통과하면 머지할 수 있습니다.

### 자주 걸리는 것

- **`pull` 후 타입 오류가 쏟아진다** → `npm install`을 안 한 경우입니다. 의존성이 추가됐을 수 있습니다.
- **`npx tsc --noEmit`이 `RouteContext`를 못 찾는다** → 정상입니다. 이 타입은 `next build`가 생성하므로
  빌드 전에는 없습니다. 타입 검사는 `npm run build`로 하세요.
- **내가 바꾸지 않은 파일이 전부 변경됨으로 보인다** → 줄바꿈 문제입니다. `.gitattributes`가 LF로
  고정하고 있으니, 그래도 생기면 `git add --renormalize .`을 실행해주세요.
- **Node 버전** → 20.9 이상이 필요하고 CI는 22를 씁니다. `.nvmrc`가 있으니 `nvm use`로 맞출 수 있습니다.

### CI는 오류를 막아주지 않습니다

CI는 푸시된 다음에 돌아서 결과를 알려줄 뿐, 잘못된 코드가 들어가는 것을 되돌리지는 않습니다.
**`main` 보호 규칙(PR 필수 + CI 통과 필수)이 설정되어야** 비로소 "통과하지 않은 코드는 main에 못 들어감"이
됩니다. 아래 7절을 참고해 관리자가 먼저 설정해주세요.

**main에 머지되면 자동으로 배포됩니다.** 보안 규칙(`firestore.rules`, `storage.rules`)과
App Hosting이 함께 올라갑니다. 즉 머지가 곧 배포이므로, main에 넣기 전에 한 번 더 확인해주세요.

## 4. 같은 Firebase를 공유할 때 주의할 점

운영과 개발이 **같은 `gap-seam` 프로젝트**를 씁니다. 그래서:

- 로컬에서 `NEXT_PUBLIC_DEMO_MODE=false`로 실행하면 **시연용 Firestore에 실제로 쓰입니다.**
- 로그인·실시간 동기화를 테스트할 때만 `false`로 두고, 끝나면 다시 `true`로 돌려주세요.
- 테스트로 만든 공간·요청·매칭은 본인이 지워주세요. 대회 시연 직전에는 특히 조심해야 합니다.
- `firestore.rules`를 바꾸면 머지 시 운영에 바로 적용됩니다. 규칙 변경 PR은 리뷰를 받아주세요.

## 5. 코드를 읽는 순서

| 파일 | 역할 |
| --- | --- |
| `src/lib/types.ts` | 데이터 구조 전체. 여기부터 보면 빠릅니다 |
| `src/lib/services.ts` | Firestore·Storage 읽기/쓰기, 실시간 구독 |
| `src/lib/matching.ts` | 공간과 요청의 적합도 점수 계산 |
| `src/lib/safety.ts` | 신뢰도 임계값, 활용안 규칙 필터, 출력 범위 강제, 재시도 |
| `src/lib/broker.ts` | 매칭 대화방의 중개 에이전트 (협의 항목 판정, 확인 서류) |
| `src/lib/agent-tools.ts` | 공간 분석 실행과 fallback |
| `src/lib/vworld.ts`, `vworld-browser.ts` | VWorld 주소·주변 시설·용도지역 조회 |
| `src/app/api/*` | 인증이 필요한 서버 API. 모델 출력을 서버에서 다시 검증합니다 |

## 6. 지켜야 할 설계 원칙

이 서비스는 **AI의 판단이 곧바로 가격·매칭·계약으로 이어지지 않도록** 만들어져 있습니다.
기능을 추가할 때 아래를 무너뜨리지 말아주세요.

1. **사람이 최종 결정한다** — 연결 제안은 소유자가 이용료를 확인해 승인하고, 이용자가 수락해야 성립합니다.
2. **근거가 부족하면 만들지 않는다** — 사진·주변 데이터가 부족하면 분석을 중단하고 추가 정보를 요청합니다.
3. **모델 출력을 믿지 않는다** — 개수·범위·허용값을 서버에서 다시 검증합니다.
4. **규칙으로 걸러낸다** — 주거·숙박·유흥·위험물 용도는 추천에서 제외합니다.
5. **실패해도 멈추지 않는다** — OpenAI·VWorld가 막히면 규칙 기반 fallback으로 이어갑니다.
6. **자격이 필요한 판단은 하지 않는다** — 권리관계 해석, 법률 자문, 계약 효력 판단은 하지 않고 확인처만 안내합니다.

`AGENTS.md`에 적힌 Next.js 관련 주의사항도 함께 확인해주세요.

## 7. 저장소·배포 권한 설정 (관리자용)

새 팀원을 받을 때 저장소 관리자가 하는 일입니다.

**저장소 권한**
1. GitHub → Settings → Collaborators → 팀원 초대 (Write 권한)
2. Settings → Branches → `main` 보호 규칙 추가 — PR 필수, CI(`verify`) 통과 필수

**자동 배포 설정** (한 번만, `FIREBASE_SERVICE_ACCOUNT` 시크릿이 없으면 배포 단계는 건너뜁니다)

```bash
# 배포 전용 서비스 계정 생성
gcloud iam service-accounts create github-deployer \
  --project gap-seam --display-name "GitHub Actions Deployer"

SA=github-deployer@gap-seam.iam.gserviceaccount.com

# App Hosting과 보안 규칙 배포에 필요한 권한
for ROLE in roles/firebasehosting.admin roles/firebaseapphosting.admin \
            roles/firebaserules.admin roles/serviceusage.serviceUsageConsumer \
            roles/cloudbuild.builds.editor roles/storage.admin; do
  gcloud projects add-iam-policy-binding gap-seam --member="serviceAccount:$SA" --role="$ROLE"
done

# App Hosting 백엔드는 실행 전용 계정으로 동작합니다.
# 배포 계정이 그 계정을 대행할 수 있어야 롤아웃이 생성됩니다.
# 이 줄을 빼면 배포가 iam.serviceAccounts.actAs denied 로 실패합니다.
# 프로젝트 전체가 아니라 이 서비스 계정 하나에만 부여합니다.
gcloud iam service-accounts add-iam-policy-binding \
  firebase-app-hosting-compute@gap-seam.iam.gserviceaccount.com \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountUser" \
  --project=gap-seam

# 키 발급 후 GitHub Secret에 등록
gcloud iam service-accounts keys create key.json --iam-account "$SA"
# GitHub → Settings → Secrets and variables → Actions →
#   New repository secret → 이름 FIREBASE_SERVICE_ACCOUNT, 값은 key.json 전체 내용
rm key.json   # 등록 후 로컬 파일은 지웁니다
```

키 값은 발급 화면에서 GitHub 입력창으로 바로 옮기고, 채팅·이슈·문서 어디에도 남기지 마세요.
실수로 노출했다면 해당 키를 폐기하고 새로 발급합니다.

```bash
gcloud iam service-accounts keys list --iam-account "$SA"
gcloud iam service-accounts keys delete <KEY_ID> --iam-account "$SA"
```

**직접 배포까지 맡기려면** Firebase Console → 사용자 및 권한에서 팀원을 편집자로 추가하고,
Secret Manager 접근 권한을 부여합니다. 다만 사람마다 권한을 나눠주는 대신
**main 머지로 배포되게 하는 쪽을 권합니다.** 누가 무엇을 배포했는지 기록이 남습니다.
