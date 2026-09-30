package com.wpcrm.calllogger

import android.content.Context
import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.k2fsa.sherpa.onnx.*
import java.util.concurrent.Executors

/** One capture device per field session. Endpoints reset decoding, never the microphone. */
class OfflineSpeech(private val context: Context, private val emit: (String, String, String, Boolean) -> Unit) {
    private val worker = Executors.newSingleThreadExecutor()
    private var recognizer: OnlineRecognizer? = null
    @Volatile private var active: String? = null
    @Volatile private var finishId: String? = null
    @Volatile private var microphone: AudioRecord? = null

    fun start(id: String) {
        stop(false)
        active = id
        worker.execute {
            var recorder: AudioRecord? = null
            var stream: OnlineStream? = null
            try {
                if (active != id) return@execute
                val engine = recognizer ?: createRecognizer(context).also { recognizer = it }
                if (active != id) return@execute
                if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                    throw SecurityException("Microphone permission denied")
                val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                check(minimum > 0) { "Microphone format unavailable" }
                recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum * 4, 32000))
                check(recorder.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
                stream = engine.createStream()
                microphone = recorder
                if (active != id) return@execute
                recorder.startRecording()
                check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Microphone did not start" }
                emit(id, "start", "", false)
                val buffer = ShortArray(1600)
                var last = ""
                while (active == id) {
                    val count = recorder.read(buffer, 0, buffer.size)
                    if (active != id) break
                    check(count > 0) { "Microphone interrupted. Tap the field to resume." }
                    stream.acceptWaveform(FloatArray(count) { buffer[it] / 32768f }, 16000)
                    while (engine.isReady(stream)) engine.decode(stream)
                    val text = engine.getResult(stream).text.trim()
                    val endpoint = engine.isEndpoint(stream)
                    if (text != last || (endpoint && text.isNotEmpty())) emit(id, "result", text, endpoint)
                    last = text
                    if (endpoint) {
                        // Silence commits this phrase, but AudioRecord stays open and reading.
                        engine.reset(stream)
                        last = ""
                    }
                }
                if (finishId == id) {
                    stream.acceptWaveform(FloatArray(8000), 16000)
                    stream.inputFinished()
                    while (engine.isReady(stream)) engine.decode(stream)
                    emit(id, "result", engine.getResult(stream).text.trim(), true)
                }
            } catch (error: Exception) {
                if (active == id || finishId == id) emit(id, "error", error.message ?: "Offline microphone failed", false)
            } finally {
                try { recorder?.stop() } catch (_: Exception) { }
                recorder?.release()
                if (microphone === recorder) microphone = null
                stream?.release()
                if (active == id) active = null
                if (finishId == id) finishId = null
                emit(id, "end", "", false)
            }
        }
    }

    fun stop(finish: Boolean) {
        finishId = if (finish) active else null
        active = null
        try { microphone?.stop() } catch (_: Exception) { }
    }

    fun close() {
        stop(false)
        worker.execute { recognizer?.release(); recognizer = null }
        worker.shutdown()
    }

    companion object {
        fun createRecognizer(context: Context) = OnlineRecognizer(context.assets, OnlineRecognizerConfig(
            modelConfig = OnlineModelConfig(
                transducer = OnlineTransducerModelConfig(
                    encoder = "model/encoder.onnx", decoder = "model/decoder.onnx", joiner = "model/joiner.onnx"),
                tokens = "model/tokens.txt", numThreads = 2, modelType = "zipformer2"),
            enableEndpoint = true,
            endpointConfig = EndpointConfig(
                rule1 = EndpointRule(false, 5f, 0f), rule2 = EndpointRule(true, 1.5f, 0f),
                rule3 = EndpointRule(false, 0f, 30f))
        ))
    }
}
