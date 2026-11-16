package com.jamesstewart.family

import android.service.dreams.DreamService
import android.webkit.WebView

/** "Stewart Family App screensaver": the same WebView, non-interactive, with `mode=screensaver` for the page. */
class FamilyDream : DreamService() {
    private var webView: WebView? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        webView = createFamilyWebView(this).also { setContentView(it) }
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        webView?.run {
            onResume()
            loadFamily("home", "mode=screensaver")
        }
    }

    override fun onDreamingStopped() {
        webView?.onPause()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        webView?.destroy()
        webView = null
        super.onDetachedFromWindow()
    }
}
