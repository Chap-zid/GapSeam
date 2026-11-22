package com.gapseam.app;

import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Google은 WebView 안의 OAuth 팝업을 차단하므로(disallowed_useragent) 앱에서는 Android Credential Manager로
 * Google ID 토큰만 받아 웹에 넘깁니다. Firebase 로그인 자체는 웹의 Firebase SDK가 signInWithCredential로 처리하므로
 * 서버 API의 ID 토큰 검증, Firestore 규칙 등 기존 인증 구조는 그대로입니다.
 *
 * 웹에서는 window.Capacitor.Plugins.GoogleSignIn.signIn() / signOut()으로 호출합니다.
 */
@CapacitorPlugin(name = "GoogleSignIn")
public class GoogleSignInPlugin extends Plugin {

    private static final String TAG = "GoogleSignIn";

    @PluginMethod
    public void signIn(PluginCall call) {
        String webClientId = getConfig().getString("webClientId", "");
        if (webClientId == null || webClientId.isEmpty()) {
            call.reject("Google 로그인 설정(webClientId)이 없습니다.", "config-missing");
            return;
        }

        // 웹의 prompt=select_account와 같이 매번 계정 선택 화면을 보여줍니다.
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(webClientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());

        manager.getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    resolveCredential(call, response.getCredential());
                }

                @Override
                public void onError(@NonNull GetCredentialException error) {
                    if (error instanceof GetCredentialCancellationException) {
                        call.reject("로그인이 취소되었습니다.", "canceled");
                    } else if (error instanceof NoCredentialException) {
                        call.reject("이 기기에서 사용할 수 있는 Google 계정이 없습니다.", "no-credential");
                    } else {
                        // 앱 서명(SHA-1)이 Firebase/Google Cloud에 등록되지 않았을 때도 여기로 옵니다.
                        Logger.error(TAG, "Credential Manager error: " + error.getType(), error);
                        call.reject("Google 로그인에 실패했습니다.", "failed", error);
                    }
                }
            }
        );
    }

    private void resolveCredential(PluginCall call, Credential credential) {
        if (!(credential instanceof CustomCredential) || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
            call.reject("Google 계정 정보를 받지 못했습니다.", "failed");
            return;
        }
        try {
            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
            JSObject result = new JSObject();
            result.put("idToken", google.getIdToken());
            result.put("email", google.getId());
            result.put("displayName", google.getDisplayName());
            call.resolve(result);
        } catch (Exception error) {
            Logger.error(TAG, "Invalid Google ID token credential", error);
            call.reject("Google 계정 정보를 읽지 못했습니다.", "failed", error);
        }
    }

    /** 다음 로그인 때 자동 선택 없이 계정 선택 화면이 다시 나오도록 기기에 남은 선택 상태를 지웁니다. */
    @PluginMethod
    public void signOut(PluginCall call) {
        CredentialManager manager = CredentialManager.create(getContext());
        manager.clearCredentialStateAsync(
            new ClearCredentialStateRequest(),
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void result) {
                    call.resolve();
                }

                @Override
                public void onError(@NonNull ClearCredentialException error) {
                    // 로그아웃 자체는 웹의 Firebase signOut으로 끝났으므로 실패해도 막지 않습니다.
                    Logger.warn(TAG, "clearCredentialState failed: " + error.getType());
                    call.resolve();
                }
            }
        );
    }
}
