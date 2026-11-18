package com.jamesstewart.family

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.RandomAccessFile
import java.util.Collections
import java.util.WeakHashMap

private const val TAG = "FamilyNature"
private const val PREFIX = "/nature/"
private val RANGE = Regex("""^bytes=(\d*)-(\d*)$""")
private val NAME = Regex("""^(manifest\.json|[\w-]{1,64}\.mp4)$""")
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

    init {
        watchDrives(context.applicationContext)
    }

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
     * A clip, in the range asked for. WebView applies a Range's start itself:
     * it skips that far into the stream it is handed (but reads on to the
     * stream's end). So the stream stands for the file from its first byte up
     * to the range's end, and WebView's skip lands on the range's start. (A
     * stream that began at the range's start would be skipped past its own
     * end, and every seek would fail.) The file stays open while the range
     * streams (opening it per read costs dropped frames: the TV's storage
     * layer makes every open slow) and closes at the end, when WebView lets
     * go, or the moment any drive is being removed (watchDrives).
     */
    private fun serve(file: File, range: String?): WebResourceResponse {
        val headers = mutableMapOf("Accept-Ranges" to "bytes", "Cache-Control" to "no-store")
        if (file.name.endsWith(".json")) {
            val bytes = file.readBytes()
            return WebResourceResponse("application/json", "utf-8", 200, "OK", headers, ByteArrayInputStream(bytes))
        }
        val size = file.length()
        val m = range?.let { RANGE.matchEntire(it.trim()) }
            ?: return WebResourceResponse("video/mp4", null, 200, "OK", headers, SeekingStream(file, size))
        val (a, b) = m.destructured
        // A suffix range ("bytes=-500"), a start past the end, or an end before
        // the start: not ours to answer.
        if (a.isEmpty() || a.toLong() >= size || (b.isNotEmpty() && b.toLong() < a.toLong())) {
            headers["Content-Range"] = "bytes */$size"
            return WebResourceResponse("video/mp4", null, 416, "Range Not Satisfiable", headers, empty())
        }
        val start = a.toLong()
        val end = if (b.isNotEmpty()) minOf(b.toLong(), size - 1) else size - 1
        headers["Content-Range"] = "bytes $start-$end/$size"
        // The stream stands for the file up to the range's end; WebView skips to its start.
        return WebResourceResponse("video/mp4", null, 206, "Partial Content", headers, SeekingStream(file, end + 1))
    }

    private fun empty() = ByteArrayInputStream(ByteArray(0))

    /**
     * The file, read from wherever WebView skips to, a large block at a time
     * (fewer, bigger reads through the TV's storage layer). Every open stream
     * is known, so a drive being removed closes them all at once (watchDrives).
     */
    private class SeekingStream(private val file: File, private val size: Long) : java.io.InputStream() {
        private var f: RandomAccessFile? = null
        private var pos = 0L
        private val buf = ByteArray(BLOCK)
        private var bufStart = 0L
        private var bufLen = 0

        init {
            live.add(this)
        }

        override fun skip(n: Long): Long {
            if (n <= 0) return 0
            val step = minOf(n, size - pos)
            pos += step
            return step
        }

        override fun available(): Int = minOf(size - pos, Int.MAX_VALUE.toLong()).toInt()

        override fun read(): Int {
            val b = ByteArray(1)
            return if (read(b, 0, 1) == 1) b[0].toInt() and 0xff else -1
        }

        @Synchronized
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (len == 0) return 0
            if (pos >= size) { close(); return -1 }
            if (pos < bufStart || pos >= bufStart + bufLen) {
                val raf = f ?: RandomAccessFile(file, "r").also { f = it }
                raf.seek(pos)
                val n = raf.read(buf, 0, minOf(BLOCK.toLong(), size - pos).toInt())
                if (n <= 0) { close(); return -1 }
                bufStart = pos
                bufLen = n
            }
            val at = (pos - bufStart).toInt()
            val n = minOf(len, bufLen - at)
            System.arraycopy(buf, at, b, off, n)
            pos += n
            return n
        }

        @Synchronized
        override fun close() {
            live.remove(this)
            try { f?.close() } catch (_: Exception) {}
            f = null
            bufLen = 0
        }
    }

    private companion object {
        const val BLOCK = 512 * 1024
        val live: MutableSet<SeekingStream> = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap()))
        @Volatile var watching = false

        /**
         * When any drive is being removed, close every open clip: Android kills a
         * process that still holds files on a volume it unmounts. The next read
         * reopens the file if it's still there, or fails gently if it isn't.
         */
        fun watchDrives(app: Context) {
            if (watching) return
            watching = true
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_MEDIA_EJECT)
                addAction(Intent.ACTION_MEDIA_UNMOUNTED)
                addAction(Intent.ACTION_MEDIA_BAD_REMOVAL)
                addAction(Intent.ACTION_MEDIA_REMOVED)
                addDataScheme("file")
            }
            app.registerReceiver(object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) {
                    Log.i(TAG, "A drive is going (${i.action}); closing open clips")
                    synchronized(live) { live.toList() }.forEach { it.close() }
                }
            }, filter)
        }
    }

    private fun missing() =
        WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Cache-Control" to "no-store"), empty())
}
