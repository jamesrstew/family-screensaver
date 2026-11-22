package com.jamesstewart.family

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
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
// A plain folder at a drive's root: adb can write there over Wi-Fi, which it
// can't do in the app's own folder on a USB drive (Android 11).
private const val DRIVE_FOLDER = "FamilyNature"

/*
 * The nature clips, served to the page from the TV itself. They live on any of
 * the app's storage volumes (usually a USB drive), at FamilyNature/ on the
 * drive's root or at Android/data/com.jamesstewart.family/files/nature/:
 * manifest.json and <id>.mp4. A drive's own folder comes first; reading it
 * takes all-files access, granted once over adb
 * (`appops set --uid com.jamesstewart.family MANAGE_EXTERNAL_STORAGE allow`);
 * without it, that folder simply isn't seen.
 * The page asks for them on its own origin (/nature/...); this answers before
 * the request reaches the network, in byte ranges so the clip can seek.
 * Nothing is ever uploaded.
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
     * The first folder holding a manifest.json: a drive's FamilyNature/, else
     * a volume's files/nature/. Looked up again every few seconds, not on
     * every range request: drives come and go. (The manifest goes on last,
     * so a drive still being filled isn't chosen.)
     */
    @Synchronized
    private fun root(): File? {
        val now = SystemClock.elapsedRealtime()
        if (now - rootAt > ROOT_TTL_MS || root?.let { File(it, "manifest.json").isFile } != true) {
            val dirs = context.getExternalFilesDirs(null).filterNotNull()
            val drives = volumes(dirs).map { File(it, DRIVE_FOLDER) }
            val found = (drives + dirs.map { File(it, "nature") })
                .firstOrNull { runCatching { File(it, "manifest.json").isFile }.getOrDefault(false) }
            if (found?.path != root?.path) Log.i(TAG, "Clips from ${found ?: "nowhere"}")
            root = found
            rootAt = now
        }
        return root
    }

    /**
     * Every mounted volume's root: from the storage manager (API 30+, which
     * lists a drive even when its app folder couldn't be made), else above
     * each app folder's Android/.
     */
    private fun volumes(dirs: List<File>): List<File> {
        val above = dirs.mapNotNull { d ->
            d.path.indexOf("/Android/").takeIf { it > 0 }?.let { File(d.path.substring(0, it)) }
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return above
        val listed = runCatching {
            context.getSystemService(StorageManager::class.java).storageVolumes
                .filter { it.state == Environment.MEDIA_MOUNTED }
                .mapNotNull { it.directory }
        }.getOrDefault(emptyList())
        return (listed + above).distinctBy { it.path }
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
        @Volatile private var f: RandomAccessFile? = null
        // Set when a drive is being removed: the stream never reopens after that.
        @Volatile var gone = false
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
            if (gone) throw java.io.IOException("drive removed")
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

        /**
         * A drive is going: mark the stream gone and close its file without
         * waiting for a read in progress (which then fails, and the page skips
         * the clip). Never takes the stream's lock, so the main thread can't
         * stall behind a read blocked on a pulled drive.
         */
        fun drop() {
            gone = true
            live.remove(this)
            try { f?.close() } catch (_: Exception) {}
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
                    val open = synchronized(live) { live.toList() }
                    open.forEach { it.gone = true }
                    Thread { open.forEach { it.drop() } }.start()
                }
            }, filter)
        }
    }

    private fun missing() =
        WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Cache-Control" to "no-store"), empty())
}
