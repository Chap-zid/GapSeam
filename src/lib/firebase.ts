import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, browserPopupRedirectResolver, browserSessionPersistence, getAuth, initializeAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";

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
  // 개발 중 새로고침(HMR)으로 이미 초기화된 경우에는 기존 인스턴스를 씁니다.
  try { auth = initializeAuth(app, { persistence: browserSessionPersistence, popupRedirectResolver: browserPopupRedirectResolver }); }
  catch { auth = getAuth(app); }
  db = getFirestore(app);
  storage = getStorage(app);
}
