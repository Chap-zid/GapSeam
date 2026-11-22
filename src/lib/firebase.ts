import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, browserLocalPersistence, browserPopupRedirectResolver, browserSessionPersistence, getAuth, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";
import { isNativeApp } from "@/lib/native-app";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseReady = Boolean(
  config.apiKey && config.projectId && process.env.NEXT_PUBLIC_DEMO_MODE !== "true",
);

let app: FirebaseApp | null = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;
export let storage: FirebaseStorage | null = null;

if (isFirebaseReady && typeof window !== "undefined") {
  app = getApps()[0] ?? initializeApp(config);
  // 로그인은 탭마다 따로 유지합니다. 한 탭은 소유자, 다른 탭은 이용자로 시연해도 서로 바뀌지 않습니다.
  // Android 앱은 화면(탭)이 하나뿐이고 앱을 다시 열 때마다 로그인하지 않도록 기기에 로그인을 유지합니다.
  // 개발 중 새로고침(HMR)으로 이미 초기화된 경우에는 기존 인스턴스를 씁니다.
  const persistence = isNativeApp() ? [indexedDBLocalPersistence, browserLocalPersistence] : browserSessionPersistence;
  try { auth = initializeAuth(app, { persistence, popupRedirectResolver: browserPopupRedirectResolver }); }
  catch { auth = getAuth(app); }
  db = getFirestore(app);
  storage = getStorage(app);
}
