// 빈틈이음 Android 앱(mobile/, Capacitor) 안에서 열렸을 때만 쓰는 연결부입니다.
// 앱은 배포된 웹을 그대로 불러오고, 네이티브 브리지가 문서 시작 시점에 window.Capacitor를 주입합니다.
// 웹 번들에 Capacitor 패키지를 추가하지 않도록 전역 객체만 사용합니다. 일반 브라우저에서는 모두 비활성입니다.

type NativeGoogleAccount = { idToken: string; email?: string; displayName?: string };
type NativeGoogleSignIn = {
  signIn: () => Promise<NativeGoogleAccount>;
  signOut: () => Promise<void>;
};
type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: { GoogleSignIn?: NativeGoogleSignIn };
};

function bridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

/** Android 앱의 WebView에서 실행 중인지 확인합니다. 앱은 User-Agent 끝에 GapSeamApp/버전을 붙입니다. */
export function isNativeApp() {
  if (typeof window === "undefined") return false;
  return Boolean(bridge()?.isNativePlatform?.()) || navigator.userAgent.includes("GapSeamApp/");
}

function googlePlugin(): NativeGoogleSignIn | null {
  const cap = bridge();
  if (!cap?.isNativePlatform?.() || !cap.isPluginAvailable?.("GoogleSignIn")) return null;
  return cap.Plugins?.GoogleSignIn ?? null;
}

/** Google은 WebView의 OAuth 팝업을 차단하므로 앱에서는 네이티브 계정 선택으로 받은 ID 토큰을 씁니다. */
export function hasNativeGoogleSignIn() {
  return googlePlugin() !== null;
}

export async function nativeGoogleIdToken() {
  const plugin = googlePlugin();
  if (!plugin) throw Object.assign(new Error("앱의 Google 로그인을 사용할 수 없습니다."), { code: "native/unavailable" });
  try {
    const { idToken } = await plugin.signIn();
    if (!idToken) throw Object.assign(new Error("Google ID 토큰이 없습니다."), { code: "failed" });
    return idToken;
  } catch (cause) {
    const code = (cause as { code?: string }).code || "failed";
    throw Object.assign(new Error((cause as Error).message || "Google 로그인에 실패했습니다."), { code: `native/${code}` });
  }
}

/** 다음 로그인 때 계정 선택 화면이 다시 나오도록 기기의 선택 상태를 지웁니다. 실패해도 로그아웃은 막지 않습니다. */
export async function nativeGoogleSignOut() {
  try { await googlePlugin()?.signOut(); } catch { /* Firebase 로그아웃은 이미 끝났습니다. */ }
}
