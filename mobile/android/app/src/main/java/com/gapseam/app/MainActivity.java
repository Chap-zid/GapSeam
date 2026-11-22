package com.gapseam.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {

    private static final Pattern UTF8_FILENAME = Pattern.compile("filename\\*\\s*=\\s*UTF-8''([^;]+)", Pattern.CASE_INSENSITIVE);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 전용 플러그인은 브리지가 만들어지기 전(super.onCreate 이전)에 등록해야 합니다.
        registerPlugin(GoogleSignInPlugin.class);
        super.onCreate(savedInstanceState);

        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        webView.setDownloadListener(this::startDownload);

        // 하드웨어/제스처 뒤로가기는 웹 페이지 기록을 먼저 따라가고, 첫 화면에서만 앱을 닫습니다.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }

    /** WebView는 파일 내려받기를 직접 처리하지 않으므로 문서(DOCX) 내려받기를 시스템 다운로드로 넘깁니다. */
    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            Toast.makeText(this, "앱에서 내려받을 수 없는 파일입니다.", Toast.LENGTH_SHORT).show();
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Android 9 이하는 공용 다운로드 폴더 쓰기 권한이 필요하므로 브라우저에 맡깁니다.
            openExternally(uri);
            return;
        }
        try {
            String fileName = fileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setMimeType(mimeType);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            request.setTitle(fileName);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "내려받기를 시작했습니다. 알림에서 확인하세요.", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            openExternally(uri);
        }
    }

    private void openExternally(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "파일을 열 수 있는 앱이 없습니다.", Toast.LENGTH_SHORT).show();
        }
    }

    /** 서버가 보내는 filename*=UTF-8''… 형식(한글 파일명)을 우선 읽습니다. */
    private static String fileName(String url, String contentDisposition, String mimeType) {
        if (contentDisposition != null) {
            Matcher matcher = UTF8_FILENAME.matcher(contentDisposition);
            if (matcher.find()) {
                try {
                    String decoded = URLDecoder.decode(matcher.group(1).trim(), StandardCharsets.UTF_8.name());
                    String safe = decoded.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
                    if (!safe.isEmpty()) return safe;
                } catch (Exception ignored) {
                    // 아래 기본 규칙으로 이름을 정합니다.
                }
            }
        }
        return URLUtil.guessFileName(url, contentDisposition, mimeType);
    }
}
