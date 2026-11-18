package com.jamesstewart.family

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
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient

private const val TAG = "Family"
private const val UNCONFIGURED_URL = "https://example.invalid"
const val NOT_CONFIGURED_ASSET = "file:///android_asset/not_configured.html"

/** The page URL for [page], or null when no app URL was baked into the build. */
fun familyUrl(page: String, extraQuery: String? = null): String? {
    val base = BuildConfig.FAMILY_URL
    if (base.isBlank() || base == UNCONFIGURED_URL) return null
    val query = "page=" + Uri.encode(page) + (extraQuery?.let { "&$it" } ?: "")
    // A fresh address every time, so the WebView never paints a cached page from hours ago.
    return "$base/?$query&t=${System.currentTimeMillis()}"
}

fun WebView.loadFamily(page: String, extraQuery: String? = null) {
    loadUrl(familyUrl(page, extraQuery) ?: notConfiguredUrl("No app URL was set at build time."))
}

private fun notConfiguredUrl(reason: String) =
    "$NOT_CONFIGURED_ASSET?url=${Uri.encode(BuildConfig.FAMILY_URL)}&reason=${Uri.encode(reason)}"

/** A full-screen WebView configured for the family web app. Shared by the activity and the dream. */
@SuppressLint("SetJavaScriptEnabled")
fun createFamilyWebView(context: Context): WebView = WebView(context).apply {
    // Dark until the page paints: a moment of dark by day is fine; a flash of light at night isn't.
    setBackgroundColor(Color.parseColor("#080807"))
    isFocusable = true
    isFocusableInTouchMode = true
    settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        mediaPlaybackRequiresUserGesture = false
        loadWithOverviewMode = true
        useWideViewPort = true
    }
    val nature = NatureFiles(context)
    webViewClient = object : WebViewClient() {
        // The nature clips, from the TV's own storage (NatureFiles.kt).
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            nature.intercept(request)

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame || request.url.scheme == "file") return
            Log.w(TAG, "Main frame failed: ${error.errorCode} ${error.description} (${request.url})")
            view.loadUrl(notConfiguredUrl("Could not reach the family app (${error.description})."))
        }
    }
    webChromeClient = AudioGrantingChromeClient(context)
}

/** The only origins that may use the microphone: the family app itself and the bundled mic test. */
private fun trusted(origin: Uri): Boolean {
    val app = Uri.parse(BuildConfig.FAMILY_URL)
    val same = origin.scheme == app.scheme && origin.host == app.host && origin.port == app.port
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
