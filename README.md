# 빈틈이음

방치된 공가의 활용 가능성을 분석하고 실제 공간 수요와 비교해, 소유자와 이용자 어느 쪽에서도 연결을 시작할 수 있는 해커톤 프로토타입입니다.

## 실행

```bash
npm install
npm run dev
```

문서 도우미는 DOCX 원본을 브라우저에서 편집하기 위해 Docker의 ONLYOFFICE Document Server를 사용합니다. 앱과 함께 아래 명령을 실행한 뒤 `/documents`로 이동하세요.

```bash
docker compose up -d
```

기본 구성은 브라우저 편집기를 `http://localhost:8080`, 편집 결과 콜백을 `http://host.docker.internal:3000`에서 찾습니다. 다른 호스트나 포트를 사용하면 `.env.local`의 `NEXT_PUBLIC_ONLYOFFICE_URL`, `DOCUMENT_SERVER_CALLBACK_ORIGIN`을 변경하세요. 문서는 개발용 로컬 `data/documents`에 저장되므로 운영 배포에서는 인증된 객체 저장소로 교체해야 합니다. HWP/HWPX는 변환 결과 손상을 피하기 위해 자동 변환하지 않으며 DOCX로 변환한 뒤 업로드합니다.

로그인에는 Firebase 설정과 Google 제공자 활성화가 필요합니다. 로그인 상태는 Firebase Auth로 확인하며 브라우저에 남은 프로필로 로그인 여부를 판단하지 않습니다.

공간 분석은 서버의 `OPENAI_API_KEY`가 있으면 Responses API를 사용하고, 호출 실패 시 Mock 분석으로 자동 전환됩니다. 키에 `NEXT_PUBLIC_` 접두사를 붙이지 마세요. 필요하면 `OPENAI_MODEL`로 모델을 바꿀 수 있으며 기본값은 `gpt-4.1-mini`입니다.

주변 환경은 `VWORD_API_KEY`로 VWorld 주소·장소·2D 데이터 API를 조회합니다. App Hosting에서 VWorld의 서버 요청이 차단되는 경우를 대비해, 로그인 사용자에게만 도메인 제한 키를 전달하고 브라우저 JSONP로 조회하는 경로를 우선 사용합니다. 주소 정제, 반경 2km 내 학교·버스정류장·편의점, 용도지역을 분석 입력에 포함하며 실패하면 샘플 환경 데이터로 전환됩니다.

배포 URL: `https://my-web-app--gap-seam.us-east4.hosted.app`

분석 API는 Firebase ID 토큰을 검증한 로그인 사용자만 호출할 수 있습니다. 배포 환경의 OpenAI 키는 `apphosting.yaml`의 값이 아니라 Google Cloud Secret Manager에서 주입됩니다.

## Firebase 설정

1. Firebase 프로젝트에서 Web App을 추가합니다.
2. Authentication에서 **Google 로그인**을 활성화하고 승인 도메인에 배포 주소를 추가합니다. 최초 가입 시 선택한 역할을 저장하고, 기존 회원은 저장된 역할로 돌아갑니다.
3. Firestore Database와 Storage를 생성합니다.
4. `.env.example`을 `.env.local`로 복사하고 Firebase Web App 설정값을 입력합니다.
5. Firebase CLI로 규칙을 배포합니다.

```bash
firebase use <project-id>
firebase deploy --only firestore:rules,storage
```

Firebase App Hosting에 `npx firebase deploy --only apphosting:my-web-app --project gap-seam`으로 배포합니다. 공개 환경 변수와 서버 비밀은 `apphosting.yaml`에서 관리합니다.

VWorld 키를 배포 환경에 처음 추가할 때는 Secret 생성과 백엔드 접근 권한 부여가 모두 필요합니다.

```bash
firebase apphosting:secrets:set VWORD_API_KEY --project gap-seam --location us-east4
firebase apphosting:secrets:grantaccess VWORD_API_KEY --backend my-web-app --location us-east4 --project gap-seam
```

## 두 기기 시연 순서

1. 기기 B: 이용자 선택 → Google 로그인 → 공간 요청 등록
2. 기기 A: 다른 Google 계정으로 소유자 로그인 → 새 공간 등록 → 공간 분석 시작
3. 에이전트가 상태·주변·활용안·비용을 순차 확인하고 Firestore 요청을 탐색
4. 기기 A: `연결 제안 보내기` → 확인 모달에서 `제안 보내기`
5. 기기 B: 새 제안이 실시간 표시됨 → `수락`
6. 기기 A: 연결 현황이 `매칭이 성사되었습니다.`로 즉시 변경됨
7. 양쪽 기기: 성사된 연결의 전용 채팅방에서 조건 협의
8. 채팅방의 `공동 문서 열기` → 같은 매칭 문서함에서 DOCX 편집·검토

이용자가 먼저 연결하는 역방향 흐름도 지원합니다.

1. `/spaces`에서 로그인 없이 등록된 공간과 분석 결과 탐색
2. 이용자로 로그인하고 등록한 공간 수요를 선택
3. 적합도 근거를 확인한 뒤 `소유자에게 이용 신청`
4. 소유자 대시보드에 신청이 실시간 표시됨 → 수락 또는 거절
5. 수락 시 양쪽에 동일한 채팅·공동 문서 작업 화면이 열림

## 매칭 알고리즘

`src/lib/matching.ts`의 **퍼지 다기준 적합도(Fuzzy MCDA v2)**를 사용합니다.

- 지역 30점, 예산 25점, 면적 20점, 활용 목적 25점
- 예산과 면적은 단순 통과/탈락 대신 차이 비율을 0~1 멤버십으로 정규화
- 활용 목적은 요청 설명과 추천 활용의 용도군·핵심어 유사도를 함께 계산
- 생활권, 최소 면적, 예산이 크게 어긋나면 제약 페널티 적용
- 항목별 점수, 경고, 최종 적합도를 함께 저장해 결과 이유를 설명 가능

## 실패 대비와 교체 지점

- 이미지 업로드 실패: `/public/images/space-hero.png` 사용
- OpenAI/Vision/VWorld/비용 분석 실패: 안정적인 샘플 결과 사용
- Firebase 미설정: 로그인 기능 비활성. 데이터 계층의 로컬 저장소는 개발용으로만 유지합니다.
- Firebase 데이터 접근: `src/lib/services.ts`에만 모아 UI와 분리

VWorld 서버 연동은 `src/lib/vworld.ts`, 브라우저 연동은 `src/lib/vworld-browser.ts`, 분석 결합은 `src/app/api/analyze/route.ts`로 분리했습니다. 계약이나 연락처 공유는 구현하지 않았으며, 소유자 제안은 `proposed`, 이용자 신청은 `applied` 상태로 시작합니다. 상대방이 수락한 `accepted` 매칭에서만 채팅과 공동 문서함을 사용할 수 있습니다.

## 주요 데이터

- `users`: 역할과 표시 이름
- `spaces`: 공간 정보, Storage 이미지 URL, 분석 결과
- `requests`: 이용자 공간 수요
- `matches`: 공간-수요 적합도, 시작 주체와 `proposed | applied | accepted | rejected` 상태
- `matches/{matchId}/messages`: 성사된 매칭 참여자의 실시간 채팅
- `data/documents`: 개발용 DOCX 원본과 매칭별 문서 메타데이터

Firestore `onSnapshot`으로 역할별 `matches`를 구독해 새로고침 없이 상태를 반영합니다.

## 계정 흐름

- 로그인 상태 복원이 완료될 때까지 보호 화면의 데이터 구독과 입력 폼을 열지 않습니다.
- 로그인한 상태에서 로그인 URL을 열면 기존 역할의 활동 화면으로 이동합니다.
- 마이페이지에서 Google 이름·이메일, 활동 수, 역할 전환 및 로그아웃을 제공합니다.
- 역할은 마이페이지에서 명시적으로 변경하며, 페이지 진입만으로 바뀌지 않습니다.
- 로그아웃은 Firebase 세션을 종료합니다. 다른 탭도 Auth 구독으로 갱신되며 보호 화면은 다시 로그인을 요구합니다.
- 익명 데모 세션은 Google 회원으로 취급하지 않습니다. 기존 익명 문서는 삭제하지 않으며 Google 계정과 자동 병합하지 않습니다.
