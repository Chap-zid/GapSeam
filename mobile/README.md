# 빈틈이음 Android 앱

배포된 웹 서비스(`https://my-web-app--gap-seam.us-east4.hosted.app`)를 그대로 불러오는 [Capacitor](https://capacitorjs.com) 앱입니다.
분석·문서·매칭 API는 서버(App Hosting)에서 동작하므로 웹을 정적 파일로 옮기지 않고 배포 주소를 감쌉니다.

- **웹 화면·기능 수정은 앱을 다시 빌드할 필요가 없습니다.** `main`에 머지되어 배포되면 앱에도 바로 반영됩니다.
- 아이콘, 앱 이름, 네이티브 플러그인, `capacitor.config.json`을 바꿀 때만 앱을 다시 빌드해 배포합니다.

| 항목 | 값 |
| --- | --- |
| 패키지 이름 | `com.gapseam.app` |
| 최소 Android | 7.0 (API 24) |
| 대상 SDK | 36 |
| 앱 User-Agent 표시 | `GapSeamApp/1.0` (웹에서 앱 실행 여부 판별용) |

## 앱에서 달라지는 점

| 기능 | 브라우저 | Android 앱 |
| --- | --- | --- |
| Google 로그인 | Firebase `signInWithPopup` | 네이티브 계정 선택(Credential Manager) → 받은 ID 토큰으로 Firebase `signInWithCredential` |
| 로그인 유지 | 탭마다 따로(세션 저장소) | 기기에 유지(앱을 다시 열어도 로그인 상태) |
| 파일 내려받기 | 브라우저 | Android 10 이상은 시스템 다운로드(알림·다운로드 폴더), 9 이하는 브라우저로 엶 |
| 외부 링크(법령 등) | 새 탭 | 기기 브라우저로 엶 |
| 뒤로가기 | 브라우저 | 웹 기록을 따라 이동, 첫 화면에서 앱 종료 |
| 네트워크 끊김 | 브라우저 오류 | `www/offline.html` 재시도 화면 |

Google은 앱 안의 WebView에서 OAuth 팝업을 차단합니다(`disallowed_useragent`). 그래서 앱은 Google 계정 선택만 네이티브로 처리하고,
Firebase 로그인·서버 API의 ID 토큰 검증·Firestore 규칙은 웹과 똑같이 동작합니다. 웹 쪽 연결부는 `src/lib/native-app.ts`이며,
웹 번들에 Capacitor 패키지를 추가하지 않고 앱이 주입하는 `window.Capacitor`만 사용합니다. 일반 브라우저에서는 아무 영향이 없습니다.

알려진 제약: Android WebView는 PDF를 화면 안에서 표시하지 못하므로 관리자 화면(`/admin/verification`)의 PDF 미리보기는 PC 브라우저에서 확인하세요.

## 처음 한 번: Firebase에 Android 앱 등록

네이티브 Google 로그인은 **Firebase(Google Cloud)에 등록된 패키지 이름 + 서명 인증서(SHA-1)** 로 빌드된 앱에서만 동작합니다.
등록하지 않으면 로그인 버튼을 눌렀을 때 "앱에서 Google 로그인을 완료하지 못했습니다"가 표시됩니다.

```bash
# 1) Android 앱 등록 (이미 등록했다면 생략)
npx firebase apps:create ANDROID "빈틈이음 Android" --package-name com.gapseam.app --project gap-seam

# 2) 위 결과의 App ID(1:439342219364:android:...)로 서명 인증서 SHA-1 등록
npx firebase apps:android:sha:create <App ID> <SHA-1> --project gap-seam
```

SHA-1은 아래 "서명 키"의 명령으로 확인합니다. Play 스토어에 올리면 Google Play가 앱을 자체 키로 다시 서명하므로,
Play Console → 앱 무결성 → **앱 서명 키 인증서의 SHA-1도 같은 방법으로 추가**해야 스토어 설치본에서 로그인이 됩니다.

Firebase 콘솔에서 하려면: 프로젝트 설정 → 내 앱 → 앱 추가 → Android → 패키지 이름 `com.gapseam.app` 입력 → 등록 후 "디지털 지문 추가"에 SHA-1 입력.
`google-services.json`은 필요 없습니다.

## 빌드

준비물: Android Studio(내장 JDK 21과 Android SDK 36 사용), Node.js 22.

```bash
cd mobile
npm install
npx cap sync android          # capacitor.config.json과 www/를 android/에 반영
```

```powershell
# PowerShell — Android Studio 내장 JDK로 빌드합니다(시스템의 다른 JDK 버전과 충돌하지 않도록).
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd mobile\android
.\gradlew assembleRelease      # 직접 설치용 APK
.\gradlew bundleRelease        # Play 스토어 업로드용 AAB
```

| 산출물 | 경로 |
| --- | --- |
| 설치용 APK | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| 스토어용 AAB | `mobile/android/app/build/outputs/bundle/release/app-release.aab` |
| 스토어 아이콘(512px) | `mobile/store/play-store-icon-512.png` |

Android Studio에서 열려면 `npx cap open android`를 실행하세요. `android/local.properties`가 없으면 Android Studio가 SDK 경로를 채워줍니다.

새 버전을 배포할 때는 `android/app/build.gradle`의 `versionCode`(정수, 매번 1 이상 증가)와 `versionName`을 올립니다.

## 서명 키

- 키 파일과 비밀번호는 **저장소에 올리지 않습니다**(`.gitignore` 처리됨). 빌드는 `mobile/android/keystore.properties`를 읽습니다.

  ```properties
  storeFile=C:/경로/gapseam-release.jks
  storePassword=...
  keyAlias=gapseam
  keyPassword=...
  ```

- 디버그 빌드도 같은 키로 서명해서, 등록한 SHA-1 하나로 디버그·릴리스 모두 로그인이 됩니다.
- **키를 잃어버리면 같은 앱으로 업데이트를 낼 수 없습니다.** 비밀번호 관리 도구 등 안전한 곳에 백업하세요.
- `keystore.properties`가 없으면 릴리스 APK는 서명되지 않은 상태(`app-release-unsigned.apk`)로 만들어집니다.

SHA-1 확인:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore <키 파일> -alias gapseam
```

## 휴대폰에 설치해서 확인하기

1. APK를 휴대폰으로 옮겨 설치합니다(처음이면 "출처를 알 수 없는 앱 설치"를 허용).
   USB 디버깅을 켰다면 `adb install -r app-release.apk`로도 설치할 수 있습니다.
2. 로그인 → 역할 선택 → 공간 등록(사진 선택)·요청 등록·채팅·공동 문서 흐름을 확인합니다.
3. 웹 디버깅이 필요하면 디버그 APK(`gradlew assembleDebug`)를 설치하고 PC Chrome의 `chrome://inspect`에서 WebView를 엽니다.

## 파일 구성

| 경로 | 역할 |
| --- | --- |
| `capacitor.config.json` | 앱 ID·이름, 불러올 배포 주소, 오류 화면, Google 로그인 웹 클라이언트 ID |
| `www/` | 오프라인 재시도 화면(`offline.html`)과 기본 페이지 |
| `android/app/src/main/java/com/gapseam/app/MainActivity.java` | 플러그인 등록, 뒤로가기, 파일 내려받기 |
| `android/app/src/main/java/com/gapseam/app/GoogleSignInPlugin.java` | 네이티브 Google 계정 선택 → ID 토큰 반환 |
| `android/app/src/main/res/` | 아이콘(적응형·테마 아이콘), 스플래시, 테마 |
| `../src/lib/native-app.ts` | 웹 쪽 앱 감지와 네이티브 로그인 호출 |

Google 로그인 웹 클라이언트 ID는 Firebase Authentication의 Google 제공업체에 설정된 값입니다(공개 값이며 비밀이 아닙니다).
Firebase 프로젝트를 바꾸면 `capacitor.config.json`의 `plugins.GoogleSignIn.webClientId`도 함께 바꾸세요.
