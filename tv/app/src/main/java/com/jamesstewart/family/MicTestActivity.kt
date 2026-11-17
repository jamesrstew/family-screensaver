package com.jamesstewart.family

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.ConsoleMessage
import android.webkit.WebView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Diagnostics: can this TV app hear the user, and which remote keys reach it?
 * Everything shown on screen is also written to logcat under the "FamilyMic" tag.
 */
class MicTestActivity : Activity() {
    private lateinit var logView: TextView
    private lateinit var meter: ProgressBar
    private lateinit var meterLabel: TextView
    private lateinit var devicesView: TextView
    private lateinit var keysView: TextView
    private var webView: WebView? = null

    private val logLines = ArrayDeque<String>()
    private val keyLines = ArrayDeque<String>()
    private var lastDownKey = KeyEvent.KEYCODE_UNKNOWN
    private var recognizer: SpeechRecognizer? = null
    @Volatile private var recording = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
        reportRecognitionServices()
        showInputDevices()
        if (!hasMic()) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, results: IntArray) {
        log("RECORD_AUDIO granted=${hasMic()}")
    }

    override fun onPause() {
        recording = false
        recognizer?.cancel()
        super.onPause()
    }

    override fun onDestroy() {
        recognizer?.destroy()
        webView?.destroy()
        super.onDestroy()
    }

    // ---- 3a. SpeechRecognizer and RecognizerIntent ----

    private fun reportRecognitionServices() {
        val services = packageManager.queryIntentServices(Intent(RecognitionService.SERVICE_INTERFACE), 0)
            .joinToString { it.serviceInfo.packageName + "/" + it.serviceInfo.name.substringAfterLast('.') }
        log("RecognitionServices: ${services.ifEmpty { "none" }}")
        log("isRecognitionAvailable=${SpeechRecognizer.isRecognitionAvailable(this)}")
        if (Build.VERSION.SDK_INT >= 31) {
            log("isOnDeviceRecognitionAvailable=${SpeechRecognizer.isOnDeviceRecognitionAvailable(this)}")
        }
    }

    private fun startSpeechRecognizer() {
        if (!hasMic()) return log("SpeechRecognizer: RECORD_AUDIO not granted")
        val sr = recognizer ?: SpeechRecognizer.createSpeechRecognizer(this).also { recognizer = it }
        sr.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = log("SR: ready, speak now")
            override fun onBeginningOfSpeech() = log("SR: speech began")
            override fun onRmsChanged(rmsdB: Float) = setMeter(rmsdB * 5 + 20, "SR rms ${"%.1f".format(rmsdB)} dB")
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() = log("SR: speech ended")
            override fun onError(error: Int) = log("SR ERROR $error ${SR_ERRORS[error] ?: "UNKNOWN"}")
            override fun onResults(results: Bundle) = log("SR RESULT: ${transcripts(results)}")
            override fun onPartialResults(partial: Bundle) = log("SR partial: ${transcripts(partial)}")
            override fun onEvent(eventType: Int, params: Bundle?) = log("SR event $eventType")
        })
        sr.startListening(recognizerIntent())
        log("SR: startListening()")
    }

    private fun startRecognizerIntent() {
        try {
            startActivityForResult(recognizerIntent().putExtra(RecognizerIntent.EXTRA_PROMPT, "Say something"), REQ_SPEECH)
            log("RecognizerIntent: launched system UI")
        } catch (e: ActivityNotFoundException) {
            log("RecognizerIntent: no activity handles ACTION_RECOGNIZE_SPEECH")
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_SPEECH) return
        val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        log("RecognizerIntent resultCode=$resultCode results=$text")
    }

    private fun recognizerIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)

    private fun transcripts(b: Bundle) =
        b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.joinToString(" | ") ?: "(none)"

    // ---- 3b. Raw AudioRecord ----

    private fun startAudioRecord(source: Int, name: String) {
        if (!hasMic()) return log("AudioRecord: RECORD_AUDIO not granted")
        if (recording) return log("AudioRecord: already recording")
        val rate = 16_000
        val minBuf = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val record = try {
            AudioRecord(source, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 2)
        } catch (e: Exception) {
            return log("AudioRecord $name: constructor threw $e")
        }
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return log("AudioRecord $name: not initialized (minBuf=$minBuf)")
        }
        recording = true
        thread(name = "mic-$name") {
            try {
                record.startRecording()
                log("AudioRecord $name: recordingState=${record.recordingState} routed=${record.routedDevice?.describe()}")
                val buf = ShortArray(minBuf / 2)
                var peakDb = -120.0
                var reads = 0
                val end = SystemClock.elapsedRealtime() + 5_000
                while (recording && SystemClock.elapsedRealtime() < end) {
                    val n = record.read(buf, 0, buf.size)
                    if (n <= 0) {
                        log("AudioRecord $name: read returned $n")
                        break
                    }
                    reads++
                    var sum = 0.0
                    for (i in 0 until n) sum += buf[i].toDouble() * buf[i]
                    val db = 20 * log10(sqrt(sum / n).coerceAtLeast(1.0) / 32768.0)
                    if (db > peakDb) peakDb = db
                    setMeter(((db + 90) / 90 * 100).toFloat(), "$name ${"%.1f".format(db)} dBFS")
                }
                log("AudioRecord $name: done, $reads reads, peak ${"%.1f".format(peakDb)} dBFS")
            } catch (e: Exception) {
                log("AudioRecord $name: threw $e")
            } finally {
                recording = false
                record.stop()
                record.release()
            }
        }
    }

    private fun showInputDevices() {
        val am = getSystemService(AudioManager::class.java)
        val devices = am.getDevices(AudioManager.GET_DEVICES_INPUTS)
        devicesView.text = "Input devices (${devices.size}):\n" +
            devices.joinToString("\n") { "  " + it.describe() }.ifEmpty { "  none" }
        Log.i(TAG, devicesView.text.toString())
    }

    private fun AudioDeviceInfo.describe(): String {
        val typeName = AudioDeviceInfo::class.java.fields
            .firstOrNull { it.name.startsWith("TYPE_") && it.getInt(null) == type }?.name ?: "TYPE_$type"
        val address = if (Build.VERSION.SDK_INT >= 28) " addr=\"$address\"" else ""
        return "#$id $typeName \"$productName\"$address"
    }

    // ---- 3c. WebView getUserMedia ----

    private fun startWebViewMicTest() {
        val wv = webView ?: WebView(this).also { wv ->
            webView = wv
            wv.isFocusable = false
            wv.settings.javaScriptEnabled = true
            wv.settings.mediaPlaybackRequiresUserGesture = false
            wv.webChromeClient = object : AudioGrantingChromeClient(this) {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    log("web: ${message.message()}")
                    return true
                }
            }
            webContainer.addView(wv, LinearLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        }
        // An https base URL gives the page a secure context, which getUserMedia requires.
        val html = assets.open("mic_test.html").bufferedReader().use { it.readText() }
        wv.loadDataWithBaseURL("https://appassets.androidplatform.net/mic_test.html", html, "text/html", "utf-8", null)
        log("WebView: loaded mic_test.html (RECORD_AUDIO granted=${hasMic()})")
    }

    // ---- Remote key logging ----

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isNewDown = event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0
        // Some keys deliver only an UP; record those too.
        val isOrphanUp = event.action == KeyEvent.ACTION_UP && lastDownKey != event.keyCode
        if (isNewDown || isOrphanUp) {
            if (isNewDown) lastDownKey = event.keyCode
            val line = "${KeyEvent.keyCodeToString(event.keyCode)} (${event.keyCode}, scan ${event.scanCode})" +
                (if (isOrphanUp) " UP-only" else "") + " from ${event.device?.name ?: "?"}"
            Log.i(TAG, "key $line")
            keyLines.addFirst(line)
            while (keyLines.size > 10) keyLines.removeLast()
            keysView.text = "Last 10 keys (newest first):\n" + keyLines.joinToString("\n")
        }
        return super.dispatchKeyEvent(event)
    }

    // ---- UI ----

    private lateinit var webContainer: LinearLayout

    private fun buildLayout(): View {
        val pad = dp(40)
        val left = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(text("Family Mic Test", 28f, bold = true))
            addView(button("1. SpeechRecognizer (in-app)") { startSpeechRecognizer() })
            addView(button("2. RecognizerIntent (system UI)") { startRecognizerIntent() })
            addView(button("3. AudioRecord VOICE_RECOGNITION, 5 s") {
                startAudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, "VOICE_RECOGNITION")
            })
            addView(button("4. AudioRecord MIC, 5 s") { startAudioRecord(MediaRecorder.AudioSource.MIC, "MIC") })
            addView(button("5. WebView getUserMedia") { startWebViewMicTest() })
            addView(button("Refresh input devices") { showInputDevices() })
            keysView = text("Last 10 keys (newest first):\n(press remote buttons)", 15f, mono = true)
            addView(keysView)
        }
        meterLabel = text("level: idle", 16f, mono = true)
        meter = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        devicesView = text("", 15f, mono = true)
        logView = text("", 15f, mono = true)
        webContainer = LinearLayout(this)
        val right = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, 0, 0, 0)
            addView(meterLabel)
            addView(meter, LinearLayout.LayoutParams(MATCH_PARENT, dp(24)))
            addView(devicesView)
            addView(logView, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
            addView(webContainer, LinearLayout.LayoutParams(MATCH_PARENT, dp(160)))
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#f8f4ea"))
            setPadding(pad, pad / 2, pad, pad / 2)
            addView(left, LinearLayout.LayoutParams(0, MATCH_PARENT, 2f))
            addView(right, LinearLayout.LayoutParams(0, MATCH_PARENT, 3f))
        }
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 18f
        setOnClickListener { onClick() }
    }

    private fun text(initial: String, size: Float, bold: Boolean = false, mono: Boolean = false) =
        TextView(this).apply {
            text = initial
            textSize = size
            setTextColor(Color.parseColor("#221e1a"))
            typeface = when {
                mono -> Typeface.MONOSPACE
                bold -> Typeface.create(Typeface.SERIF, Typeface.BOLD)
                else -> Typeface.SERIF
            }
            setPadding(0, dp(6), 0, dp(6))
        }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun setMeter(percent: Float, label: String) = runOnUiThread {
        meter.progress = percent.toInt().coerceIn(0, 100)
        meterLabel.text = "level: $label"
    }

    private fun log(message: String) {
        Log.i(TAG, message)
        runOnUiThread {
            logLines.addFirst("${TIME.format(Date())} $message")
            while (logLines.size > 14) logLines.removeLast()
            logView.text = logLines.joinToString("\n")
        }
    }

    companion object {
        private const val TAG = "FamilyMic"
        private const val REQ_MIC = 1
        private const val REQ_SPEECH = 2
        private val TIME = SimpleDateFormat("HH:mm:ss", Locale.US)
        private val SR_ERRORS = mapOf(
            1 to "NETWORK_TIMEOUT", 2 to "NETWORK", 3 to "AUDIO", 4 to "SERVER", 5 to "CLIENT",
            6 to "SPEECH_TIMEOUT", 7 to "NO_MATCH", 8 to "RECOGNIZER_BUSY", 9 to "INSUFFICIENT_PERMISSIONS",
            10 to "TOO_MANY_REQUESTS", 11 to "SERVER_DISCONNECTED", 12 to "LANGUAGE_NOT_SUPPORTED",
            13 to "LANGUAGE_UNAVAILABLE", 14 to "CANNOT_CHECK_SUPPORT", 15 to "CANNOT_LISTEN_TO_DOWNLOAD_EVENTS",
        )
    }
}
