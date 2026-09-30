package com.wpcrm.calllogger

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/** All calls and callbacks run on the main thread. Never falls back to another engine. */
class OnlineSpeech(private val context: Context, private val emit: (String, String, String, Boolean) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var active: String? = null
    private var stopTimeout: Runnable? = null

    private fun end(id: String) {
        if (active != id) return
        active = null
        stopTimeout?.let { handler.removeCallbacks(it) }; stopTimeout = null
        val old = recognizer; recognizer = null
        old?.destroy()
        emit(id, "end", "", false)
    }

    fun start(id: String) {
        stop(false)
        active = id
        val network = context.getSystemService(ConnectivityManager::class.java)
        val capabilities = network.getNetworkCapabilities(network.activeNetwork)
        if (capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) != true) {
            emit(id, "error", "No internet connection. Uncheck Online voice recognition to use on-device speech", false)
            end(id); return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            emit(id, "error", "No phone speech service available. Use on-device speech or enable a speech service in Android settings", false)
            end(id); return
        }
        try {
            val engine = SpeechRecognizer.createSpeechRecognizer(context)
            recognizer = engine
            engine.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { if (active == id) emit(id, "start", "", false) }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {
                    if (active == id) scheduleEnd(id)
                }
                override fun onPartialResults(results: Bundle?) { result(results, false) }
                override fun onResults(results: Bundle?) { result(results, true); end(id) }
                private fun result(results: Bundle?, final: Boolean) {
                    if (active != id) return
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    if (text.isNotBlank()) emit(id, "result", text, final)
                }
                override fun onError(error: Int) {
                    if (active != id) return
                    val message = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech recognized. Tap the field to try again"
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Online speech connection failed. Your entry is kept"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission denied"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Phone speech service is busy. Try again"
                        else -> "Phone speech service error ($error). Try again or select on-device speech"
                    }
                    emit(id, "error", message, false); end(id)
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            engine.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            })
        } catch (_: Exception) {
            emit(id, "error", "Online speech could not start. Use on-device speech or check your phone speech service", false)
            end(id)
        }
    }

    private fun scheduleEnd(id: String) {
        stopTimeout?.let { handler.removeCallbacks(it) }
        stopTimeout = Runnable { end(id) }.also { handler.postDelayed(it, 8000) }
    }

    fun stop(finish: Boolean) {
        val id = active ?: return
        if (finish) {
            try { recognizer?.stopListening(); scheduleEnd(id) }
            catch (_: Exception) { end(id) }
        } else {
            // Invalidate callbacks before cancelling the provider.
            active = null
            stopTimeout?.let { handler.removeCallbacks(it) }; stopTimeout = null
            recognizer?.cancel(); recognizer?.destroy(); recognizer = null
        }
    }
}
