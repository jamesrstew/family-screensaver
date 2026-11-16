package com.jamesstewart.heritage

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.util.Log
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

private const val TAG = "Heritage"
private const val UNCONFIGURED_URL = "https://example.invalid"
const val NOT_CONFIGURED_ASSET = "file:///android_asset/not_configured.html"

/** The page URL for [page], or null when no Heritage URL was baked into the build. */
fun heritageUrl(page: String, extraQuery: String? = null): String? {
    val base = BuildConfig.HERITAGE_URL
    if (base.isBlank() || base == UNCONFIGURED_URL) return null
    val query = "page=" + Uri.encode(page) + (extraQuery?.let { "&$it" } ?: "")
    return "$base/?$query"
}

fun WebView.loadHeritage(page: String, extraQuery: String? = null) {
    loadUrl(heritageUrl(page, extraQuery) ?: notConfiguredUrl("No Heritage URL was set at build time."))
}

private fun notConfiguredUrl(reason: String) =
    "$NOT_CONFIGURED_ASSET?url=${Uri.encode(BuildConfig.HERITAGE_URL)}&reason=${Uri.encode(reason)}"

/** A full-screen WebView configured for the Heritage web app. Shared by the activity and the dream. */
@SuppressLint("SetJavaScriptEnabled")
fun createHeritageWebView(context: Context): WebView = WebView(context).apply {
    setBackgroundColor(Color.parseColor("#f8f4ea"))
    isFocusable = true
    isFocusableInTouchMode = true
    settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        mediaPlaybackRequiresUserGesture = false
        loadWithOverviewMode = true
        useWideViewPort = true
    }
    webViewClient = object : WebViewClient() {
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame || request.url.scheme == "file") return
            Log.w(TAG, "Main frame failed: ${error.errorCode} ${error.description} (${request.url})")
            view.loadUrl(notConfiguredUrl("Could not reach Heritage (${error.description})."))
        }
    }
    webChromeClient = AudioGrantingChromeClient(context)
}

/** The only origins that may use the microphone: Heritage itself and the bundled mic test. */
private fun trusted(origin: Uri): Boolean {
    val heritage = Uri.parse(BuildConfig.HERITAGE_URL)
    val same = origin.scheme == heritage.scheme && origin.host == heritage.host && origin.port == heritage.port
    return same || origin.host == "appassets.androidplatform.net"
}

/** Grants web audio capture to trusted origins, once the app itself holds RECORD_AUDIO. */
open class AudioGrantingChromeClient(private val context: Context) : WebChromeClient() {
    override fun onPermissionRequest(request: PermissionRequest) {
        val wantsAudio = PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources
        val hasMic = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        val ok = trusted(request.origin)
        Log.i(TAG, "onPermissionRequest ${request.resources.toList()} from ${request.origin} hasMic=$hasMic trusted=$ok")
        if (wantsAudio && hasMic && ok) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            request.deny()
        }
    }
}
