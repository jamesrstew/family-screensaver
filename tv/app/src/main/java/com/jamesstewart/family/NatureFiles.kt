package com.jamesstewart.family

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FilterInputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.channels.Channels

private const val TAG = "FamilyNature"
private const val PREFIX = "/nature/"
private val NAME = Regex("""^(manifest\.json|[\w-]{1,64}\.mp4)$""")
private val RANGE = Regex("""^bytes=(\d*)-(\d*)$""")

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

    /** The first volume holding files/nature/manifest.json, looked up afresh each time: drives come and go. */
    private fun root(): File? =
        context.getExternalFilesDirs(null).asSequence()
            .filterNotNull()
            .map { File(it, "nature") }
            .firstOrNull { File(it, "manifest.json").isFile }

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

    private fun serve(file: File, range: String?): WebResourceResponse {
        val size = file.length()
        val type = if (file.name.endsWith(".json")) "application/json" else "video/mp4"
        val headers = mutableMapOf(
            "Accept-Ranges" to "bytes",
            "Cache-Control" to "no-store",
            "Access-Control-Allow-Origin" to "*",
        )
        val m = range?.let { RANGE.matchEntire(it.trim()) }
        if (m == null) {
            headers["Content-Length"] = size.toString()
            return WebResourceResponse(type, null, 200, "OK", headers, file.inputStream())
        }
        val (a, b) = m.destructured
        val start = if (a.isNotEmpty()) a.toLong() else maxOf(size - b.toLong(), 0)
        val end = if (a.isNotEmpty() && b.isNotEmpty()) minOf(b.toLong(), size - 1) else size - 1
        if (start > end || start >= size) {
            headers["Content-Range"] = "bytes */$size"
            return WebResourceResponse(type, null, 416, "Range Not Satisfiable", headers, empty())
        }
        headers["Content-Range"] = "bytes $start-$end/$size"
        headers["Content-Length"] = (end - start + 1).toString()
        return WebResourceResponse(type, null, 206, "Partial Content", headers, slice(file, start, end - start + 1))
    }

    /** Bytes [start, start + length) of the file, as a stream. */
    private fun slice(file: File, start: Long, length: Long): InputStream {
        val raf = RandomAccessFile(file, "r").apply { seek(start) }
        var left = length
        return object : FilterInputStream(Channels.newInputStream(raf.channel)) {
            override fun read(): Int = if (left <= 0) -1 else super.read().also { if (it >= 0) left-- }
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (left <= 0) return -1
                val n = super.read(b, off, minOf(len.toLong(), left).toInt())
                if (n > 0) left -= n
                return n
            }
            override fun close() = raf.close()
        }
    }

    private fun empty() = ByteArrayInputStream(ByteArray(0))

    private fun missing() =
        WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Cache-Control" to "no-store"), empty())
}
