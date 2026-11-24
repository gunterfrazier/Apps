package com.ourfaithfulchurch.screens;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Our Faithful Screens: the church's TV screens (lobby signage, classroom displays, presentation and stage screens)
 * as a Google TV / Android TV app. It's one full-screen WebView showing the Our Faithful web app, which already knows
 * how to pair a screen and play its job; this app adds what a TV needs around it: always on, full screen, sound
 * without a tap, coming back after a power cut, and trying again when the internet drops.
 *
 * Google TV has no Chrome, so this uses the system WebView rather than a Trusted Web Activity. The web app's service
 * worker still runs inside it, so saved playlists keep playing without internet.
 */
public class MainActivity extends Activity {
    private static final long RETRY_MS = 30_000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private View offlinePanel;
    private FrameLayout fullscreenHolder;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private long lastBack = 0;
    private boolean pageFailed = false;
    private ConnectivityManager.NetworkCallback netCallback;

    private final Runnable retry = () -> { if (pageFailed) reload(); };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // A church screen stays on and fills the TV.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        fullscreenHolder = new FrameLayout(this);
        fullscreenHolder.setBackgroundColor(Color.BLACK);
        fullscreenHolder.setVisibility(View.GONE);
        root.addView(fullscreenHolder, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        offlinePanel = buildOfflinePanel();
        root.addView(offlinePanel, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // the screen's pairing and saved playlists
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // videos, the kids intro and its music start on their own
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Lets the web app know it's on a TV (bigger focus rings, straight to pairing).
        s.setUserAgentString(s.getUserAgentString() + " OurFaithfulScreens/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme();
                // Everything on the web stays in this screen; there's no browser on a TV to hand it to.
                return !"https".equals(scheme) && !"http".equals(scheme);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!pageFailed) offlinePanel.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // Only the page itself failing matters; a missing picture is the web app's business.
                if (req.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // Full-screen video (a sermon, a YouTube slide).
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                fullscreenHolder.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                fullscreenHolder.setVisibility(View.VISIBLE);
                web.setVisibility(View.INVISIBLE);
            }

            @Override
            public void onHideCustomView() { leaveFullscreen(); }

            // A screen never asks for the camera or microphone.
            @Override
            public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(BuildConfig.APP_URL);
        watchNetwork();
    }

    private void leaveFullscreen() {
        if (fullscreenView == null) return;
        fullscreenHolder.removeView(fullscreenView);
        fullscreenHolder.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenView = null;
        fullscreenCallback = null;
        hideSystemBars();
    }

    private View buildOfflinePanel() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.rgb(11, 19, 38));
        box.setVisibility(View.GONE);
        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(34);
        title.setGravity(Gravity.CENTER);
        TextView body = new TextView(this);
        body.setText(R.string.offline_body);
        body.setTextColor(Color.rgb(190, 205, 235));
        body.setTextSize(20);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, 24, 0, 36);
        Button again = new Button(this);
        again.setText(R.string.offline_retry);
        again.setOnClickListener(v -> reload());
        box.addView(title);
        box.addView(body);
        box.addView(again);
        return box;
    }

    private void showOffline() {
        pageFailed = true;
        offlinePanel.setVisibility(View.VISIBLE);
        View b = ((ViewGroup) offlinePanel).getChildAt(2);
        if (b != null) b.requestFocus();
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, RETRY_MS);
    }

    private void reload() {
        pageFailed = false;
        handler.removeCallbacks(retry);
        String url = web.getUrl();
        if (url == null || url.startsWith("about:") || url.startsWith("data:")) web.loadUrl(BuildConfig.APP_URL);
        else web.reload();
    }

    /** When the internet comes back, try again straight away instead of waiting for the next 30-second retry. */
    private void watchNetwork() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        netCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) { handler.post(() -> { if (pageFailed) reload(); }); }
        };
        try { cm.registerDefaultNetworkCallback(netCallback); } catch (RuntimeException ignored) { netCallback = null; }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /**
     * Back: leaves full-screen video, then goes back in the web app; on a screen's own page, two presses close the app,
     * so a bump of the remote doesn't take the lobby screen down. (Taking a screen out of its job uses the web app's
     * exit code.)
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK && e.getAction() == KeyEvent.ACTION_UP) {
            if (fullscreenView != null) { leaveFullscreen(); return true; }
            long now = System.currentTimeMillis();
            if (now - lastBack < 2500) { finish(); return true; }
            lastBack = now;
            if (web.canGoBack() && !onScreenJob()) { web.goBack(); return true; }
            Toast.makeText(this, R.string.back_again, Toast.LENGTH_SHORT).show();
            return true;
        }
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(e);
    }

    /** On a screen's job (signage, a room display, following the booth), Back doesn't move around. */
    private boolean onScreenJob() {
        String u = web.getUrl();
        if (u == null) return false;
        int i = u.indexOf('#');
        String hash = i < 0 ? "" : u.substring(i + 1);
        return hash.startsWith("signage-") || hash.startsWith("display-") || hash.startsWith("stage-") || hash.startsWith("overlay-");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); web.resumeTimers(); }

    @Override
    protected void onPause() {
        // Keep playing behind a TV overlay (volume, notifications); only stop when the app is really left.
        super.onPause();
        if (isFinishing()) { web.onPause(); web.pauseTimers(); }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (netCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try { ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCallback); } catch (RuntimeException ignored) { }
        }
        web.destroy();
        super.onDestroy();
    }
}
