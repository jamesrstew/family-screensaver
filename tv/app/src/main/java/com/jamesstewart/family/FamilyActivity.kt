package com.jamesstewart.family

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebView
import android.window.OnBackInvokedDispatcher

/**
 * Full-screen WebView shell. Each launcher alias (Stewart Family App, Family Weather, ...) targets this
 * activity and names its page in `family.page` meta-data. `adb shell am start ... --es page X`
 * overrides it for testing.
 */
class FamilyActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        webView = createFamilyWebView(this)
        setContentView(webView)
        webView.requestFocus()
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadFamily(pageFor(intent))
        }
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, ::handleBack
            )
        }
    }

    // singleTask: launching a different alias while we're running lands here.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        webView.loadFamily(pageFor(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        Log.d("Family", "key ${KeyEvent.keyCodeToString(event.keyCode)} action=${event.action}")
        return super.dispatchKeyEvent(event)
    }

    // D-pad and Enter reach the page through normal WebView focus; only Back is handled here.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = handleBack()

    private fun handleBack() {
        val onFallbackPage = webView.url?.startsWith(NOT_CONFIGURED_ASSET) == true
        if (webView.canGoBack() && !onFallbackPage) webView.goBack() else finish()
    }

    private fun pageFor(intent: Intent): String {
        intent.getStringExtra("page")?.let { return it }
        val component = intent.component ?: return "home"
        return try {
            packageManager.getActivityInfo(component, PackageManager.GET_META_DATA)
                .metaData?.getString("family.page") ?: "home"
        } catch (e: PackageManager.NameNotFoundException) {
            "home"
        }
    }
}
