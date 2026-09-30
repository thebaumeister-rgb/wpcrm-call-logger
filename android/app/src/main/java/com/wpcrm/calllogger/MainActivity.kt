package com.wpcrm.calllogger

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.*
import android.widget.Toast
import android.widget.FrameLayout
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var speech: OfflineSpeech
    private var pendingMic: String? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var exportContents: String? = null
    private var foreground = false
    private var destroyed = false
    private var permissionPending = false
    private val home = "https://appassets.androidplatform.net/assets/www/index.html"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.tag = "wpcrm-web"
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, root).isAppearanceLightStatusBars = true
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            insets
        }
        ViewCompat.requestApplyInsets(root)
        speech = OfflineSpeech(this) { id, type, text, final ->
            runOnUiThread {
                if (destroyed) return@runOnUiThread
                val message = JSONObject().put("id", id).put("type", type).put("text", text).put("final", final)
                web.evaluateJavascript("window.receiveOfflineSpeech?.($message)", null)
                if (type == "end" && pendingMic == id) {
                    pendingMic = null
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }
        }
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }
        web.addJavascriptInterface(Bridge(), "OfflineAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                web.evaluateJavascript("if(document.querySelector('.app-status a')) document.querySelector('.app-status a').href='android-guide.html';", null)
            }
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse =
                loader.shouldInterceptRequest(request.url)
                    ?: WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !(request.url.scheme == "https" && request.url.host == "appassets.androidplatform.net" &&
                    request.url.path in listOf("/assets/www/index.html", "/assets/www/android-guide.html"))
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton("OK") { _, _ -> result.confirm() }
                    .setNegativeButton("Cancel") { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE); type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/*", "application/octet-stream"))
                }, 2)
                return true
            }
        }
        web.loadUrl(home)
    }

    inner class Bridge {
        @JavascriptInterface fun openUpdates() = runOnUiThread {
            // Explicit user action opens an external browser; the app itself has no network access.
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/thebaumeister-rgb/wpcrm-call-logger/releases"))) }
            catch (_: Exception) { toast("Open the WPCRM GitHub releases page in your browser for updates.") }
        }
        @JavascriptInterface fun copyText(text: String) = runOnUiThread {
            (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Call log", text))
            toast("Latest call copied")
        }
        @JavascriptInterface fun start(id: String) = runOnUiThread {
            if (!foreground || id.length > 80) return@runOnUiThread
            pendingMic = id
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                permissionPending = true
                requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
            } else startMicrophone(id)
        }
        @JavascriptInterface fun stop(id: String, finish: Boolean) = runOnUiThread {
            if (id == pendingMic) {
                speech.stop(finish)
                if (!finish) { pendingMic = null; permissionPending = false }
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        @JavascriptInterface fun exportFile(filename: String, contents: String, mime: String, share: Boolean) = runOnUiThread {
            if (contents.length > 16_000_000 || exportContents != null) { toast("Export busy or too large."); return@runOnUiThread }
            val name = filename.replace(Regex("[^a-zA-Z0-9._-]"), "_").take(120)
            val type = if (mime.startsWith("text/csv")) "text/csv" else if (mime == "application/json") mime else "text/plain"
            try {
                if (share) {
                    val folder = File(cacheDir, "exports").apply { mkdirs() }
                    folder.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86400000 }?.forEach { it.delete() }
                    val file = File(folder, name).apply { writeText(contents) }
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.exports", file)
                    startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        this.type = type; putExtra(Intent.EXTRA_STREAM, uri)
                        clipData = ClipData.newRawUri("Call logs", uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }, "Share call logs"))
                } else {
                    exportContents = contents
                    startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE); this.type = type; putExtra(Intent.EXTRA_TITLE, name)
                    }, 3)
                }
            } catch (_: Exception) { exportContents = null; toast("Could not export. Saved calls are kept.") }
        }
    }

    private fun startMicrophone(id: String) {
        permissionPending = false
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        speech.start(id)
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        val id = pendingMic ?: return
        if (code == 1 && results.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            if (foreground && permissionPending) startMicrophone(id)
            // Otherwise onResume starts the user's pending request after the dialog closes.
        }
        else {
            val data = JSONObject().put("id", id).put("type", "error").put("text", "Microphone permission denied")
            web.evaluateJavascript("window.receiveOfflineSpeech?.($data)", null)
            pendingMic = null
            permissionPending = false
        }
    }
    override fun onActivityResult(code: Int, result: Int, data: Intent?) {
        super.onActivityResult(code, result, data)
        if (code == 2) {
            fileCallback?.onReceiveValue(if (result == RESULT_OK && data?.data?.scheme == "content") arrayOf(data.data!!) else null)
            fileCallback = null
        }
        if (code == 3) {
            val contents = exportContents
            exportContents = null
            if (result == RESULT_OK && contents != null && data?.data != null) {
                try {
                    val output = contentResolver.openOutputStream(data.data!!) ?: error("No destination")
                    output.bufferedWriter().use { it.write(contents) }
                    toast("Export saved")
                } catch (_: Exception) { toast("Export failed. Saved calls are kept.") }
            }
        }
    }
    override fun onResume() {
        super.onResume()
        foreground = true
        if (permissionPending && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
            pendingMic?.let { startMicrophone(it) }
    }
    override fun onPause() {
        foreground = false
        // A permission dialog can pause the activity before capture has begun.
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            web.evaluateJavascript("window.stopFieldDictation?.('Microphone stopped while app is in background. Your entry is kept.')", null)
            speech.stop(false)
            pendingMic = null
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        super.onPause()
    }
    override fun onDestroy() { destroyed = true; speech.close(); web.destroy(); super.onDestroy() }
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
