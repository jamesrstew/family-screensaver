package com.jamesstewart.heritage

import android.service.dreams.DreamService
import android.webkit.WebView

/** "Heritage screensaver": the same WebView, non-interactive, with `mode=screensaver` for the page. */
class HeritageDream : DreamService() {
    private var webView: WebView? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        webView = createHeritageWebView(this).also { setContentView(it) }
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        webView?.run {
            onResume()
            loadHeritage("home", "mode=screensaver")
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
