package com.jamesstewart.family

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.RandomAccessFile

private const val TAG = "FamilyNature"
private const val PREFIX = "/nature/"
private val NAME = Regex("""^(manifest\.json|[\w-]{1,64}\.mp4)$""")
private val RANGE = Regex("""^bytes=(\d*)-(\d*)$""")
// At most this much of a clip per request, read whole and the file closed.
private const val CHUNK = 2L * 1024 * 1024
private const val ROOT_TTL_MS = 5_000L

/*
 * The nature clips, served to the page from the TV itself. They live on any of
 * the app's storage volumes (usually a USB drive) at
 * Android/data/com.jamesstewart.family/files/nature/: manifest.json and <id>.mp4.
 * The page asks for them on its own origin (/nature/...); this answers before
 * the request reaches the network, in byte ranges so the clip can seek.
 * Nothing is ever uploaded, and the app needs no storage permission.
 *
 * Anything missing (no drive, a drive pulled out, a file not there) is a 404,
 * and the page simply goes on without that clip.
 */
class NatureFiles(private val context: Context) {

    private var root: File? = null
    private var rootAt = 0L

    /**
     * The first volume holding files/nature/manifest.json. Looked up again
     * every few seconds, not on every range request: drives come and go.
     */
    @Synchronized
    private fun root(): File? {
        val now = SystemClock.elapsedRealtime()
        if (now - rootAt > ROOT_TTL_MS || root?.let { File(it, "manifest.json").isFile } != true) {
            root = context.getExternalFilesDirs(null).asSequence()
                .filterNotNull()
                .map { File(it, "nature") }
                .firstOrNull { File(it, "manifest.json").isFile }
            rootAt = now
        }
        return root
    }

    /** A response for /nature/... on the family app's own origin, or null to let the request through. */
    fun intercept(request: WebResourceRequest): WebResourceResponse? {
        val url = request.url
        val path = url.path ?: return null
        if (request.method != "GET" || !path.startsWith(PREFIX) || !sameOrigin(url)) return null
        val name = path.removePrefix(PREFIX)
        if (!NAME.matches(name)) return missing()
        val file = root()?.let { File(it, name) }?.takeIf { it.isFile } ?: return missing()
        return try {
            serve(file, request.requestHeaders.entries.firstOrNull { it.key.equals("Range", true) }?.value)
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't serve $name: $e")
            missing()
        }
    }

    private fun sameOrigin(url: Uri): Boolean {
        val app = Uri.parse(BuildConfig.FAMILY_URL)
        return url.scheme == app.scheme && url.host == app.host && url.port == app.port
    }

    /**
     * Every range is read whole into memory and the file closed before the
     * answer goes: no handle outlives a request, so a drive pulled out never
     * finds the app holding a file open (Android kills a process that does). A
     * clip is answered a chunk at a time (206); the player asks for the next.
     */
    private fun serve(file: File, range: String?): WebResourceResponse {
        val size = file.length()
        val headers = mutableMapOf("Accept-Ranges" to "bytes", "Cache-Control" to "no-store")
        if (file.name.endsWith(".json")) {
            val bytes = file.readBytes()
            headers["Content-Length"] = bytes.size.toString()
            return WebResourceResponse("application/json", "utf-8", 200, "OK", headers, ByteArrayInputStream(bytes))
        }
        // No range asked (or one we can't read): the clip's first chunk, bounded
        // like any other. The player always asks for ranges anyway.
        val m = range?.let { RANGE.matchEntire(it.trim()) } ?: RANGE.matchEntire("bytes=0-")!!
        val (a, b) = m.destructured
        // "bytes=-": no start and no length. Nothing to send.
        if (a.isEmpty() && b.isEmpty()) {
            headers["Content-Range"] = "bytes */$size"
            return WebResourceResponse("video/mp4", null, 416, "Range Not Satisfiable", headers, empty())
        }
        val start = if (a.isNotEmpty()) a.toLong() else maxOf(size - b.toLong(), 0)
        val last = if (a.isNotEmpty() && b.isNotEmpty()) minOf(b.toLong(), size - 1) else size - 1
        if (start > last || start >= size) {
            headers["Content-Range"] = "bytes */$size"
            return WebResourceResponse("video/mp4", null, 416, "Range Not Satisfiable", headers, empty())
        }
        val end = minOf(last, start + CHUNK - 1)
        val bytes = ByteArray((end - start + 1).toInt())
        RandomAccessFile(file, "r").use { f ->
            f.seek(start)
            f.readFully(bytes)
        }
        headers["Content-Range"] = "bytes $start-$end/$size"
        headers["Content-Length"] = bytes.size.toString()
        return WebResourceResponse("video/mp4", null, 206, "Partial Content", headers, ByteArrayInputStream(bytes))
    }

    private fun empty() = ByteArrayInputStream(ByteArray(0))

    private fun missing() =
        WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Cache-Control" to "no-store"), empty())
}
