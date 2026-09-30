package com.wpcrm.calllogger

import android.content.pm.PackageManager
import android.content.Intent
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class OfflineAcceptanceTest {
    @Test fun installedFormSavesOfflineAndKeepsHistoryOnFreshLaunch() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        instrumentation.uiAutomation.executeShellCommand("pm grant ${context.packageName} android.permission.RECORD_AUDIO").close()
        fun launch() = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        var activity = launch()
        fun evaluate(code: String): String {
            val done = CountDownLatch(1)
            val result = AtomicReference<String>()
            instrumentation.runOnMainSync {
                val web = activity.findViewById<FrameLayout>(android.R.id.content).findViewWithTag<WebView>("wpcrm-web")
                web.evaluateJavascript(code) { result.set(it); done.countDown() }
            }
            assertTrue("WebView did not respond", done.await(10, TimeUnit.SECONDS))
            return result.get()
        }
        fun awaitPage() {
            val deadline = System.currentTimeMillis() + 15000
            while (evaluate("typeof saveCurrentForm") != "\"function\"" && System.currentTimeMillis() < deadline) Thread.sleep(200)
            assertEquals("\"function\"", evaluate("typeof saveCurrentForm"))
        }
        try {
            awaitPage()
            assertEquals("\"object\"", evaluate("typeof OfflineAndroid"))
            assertEquals("false", evaluate("document.querySelector('#dictate-on-tap').checked"))
            assertEquals("true", evaluate("appointmentDatetime.value === nowForInput() && appointmentEndDatetime.value === appointmentDatetime.value"))
            evaluate("document.querySelector('#dictate-on-tap').checked = true; document.querySelector('#contact-name').click()")
            val microphoneDeadline = System.currentTimeMillis() + 15000
            while (evaluate("document.querySelector('#field-microphone-status').textContent.startsWith('Listening')") != "true" && System.currentTimeMillis() < microphoneDeadline) Thread.sleep(200)
            assertEquals("true", evaluate("document.querySelector('#field-microphone-status').textContent.startsWith('Listening')"))
            Thread.sleep(12000)
            assertEquals("false", evaluate("document.querySelector('#field-microphone').hidden"))
            assertEquals("true", evaluate("fieldSession !== null && fieldSession.runs.length === 1"))
            evaluate("document.querySelector('#stop-field-microphone').click()")
            val stoppedDeadline = System.currentTimeMillis() + 15000
            while (evaluate("fieldSession === null") != "true" && System.currentTimeMillis() < stoppedDeadline) Thread.sleep(100)
            assertEquals("true", evaluate("fieldSession === null"))
            evaluate("""
                localStorage.removeItem('wpcrm-sales-calls-v1'); calls = []; storageBlocked = false;
                document.querySelector('#dictate-on-tap').checked = false;
                contactName.value = 'Offline sample contact'; appointmentSubject.value = 'Offline sample';
                appointmentDatetime.value = '2026-09-29T10:00'; appointmentEndDatetime.value = '2026-09-29T10:30';
                appointmentStatus.value = 'Completed'; setAppointmentType('Decision-Maker Conference Call');
                mileage.value = '0'; appointmentNotes.value = 'Offline test note'; saveCurrentForm();
            """.trimIndent())
            assertEquals("1", evaluate("JSON.parse(localStorage.getItem('wpcrm-sales-calls-v1')).length"))
            instrumentation.runOnMainSync { activity.finish() }
            activity = launch()
            awaitPage()
            assertEquals("\"\"", evaluate("document.querySelector('#contact-name').value"))
            assertEquals("1", evaluate("document.querySelectorAll('.call-card').length"))
            assertTrue(evaluate("getJsonExport()").contains("Offline sample contact"))
        } finally { instrumentation.runOnMainSync { activity.finish() } }
    }

    @Test fun packageHasNoInternetPermission() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        assertFalse(info.requestedPermissions.orEmpty().contains("android.permission.INTERNET"))
    }


    @Test fun microphoneStaysOpenThroughTwelveSecondsOfSilence() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        instrumentation.uiAutomation.executeShellCommand("pm grant ${context.packageName} android.permission.RECORD_AUDIO").close()
        val started = CountDownLatch(1)
        val ended = CountDownLatch(1)
        val starts = AtomicInteger()
        val failures = mutableListOf<String>()
        val recorder = OfflineSpeech(context) { _, type, text, _ ->
            if (type == "start") { starts.incrementAndGet(); started.countDown() }
            if (type == "end") ended.countDown()
            if (type == "error") synchronized(failures) { failures.add(text) }
        }
        try {
            recorder.start("silence-test")
            assertTrue("Microphone did not start: $failures", started.await(45, TimeUnit.SECONDS))
            assertFalse("Capture ended during silence: $failures", ended.await(12, TimeUnit.SECONDS))
            assertEquals(1, starts.get())
            recorder.stop(true)
            assertTrue(ended.await(15, TimeUnit.SECONDS))
            assertTrue(failures.toString(), failures.isEmpty())
        } finally { recorder.close() }
    }

    @Test fun bundledModelDecodesSpeechAcrossLongSilenceWithoutNetwork() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val engine = OfflineSpeech.createRecognizer(instrumentation.targetContext)
        val stream = engine.createStream()
        try {
            val wav = instrumentation.context.assets.open("sample.wav").use { it.readBytes() }
            val bytes = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
            var offset = 12
            var samples = FloatArray(0)
            while (offset + 8 <= wav.size) {
                val size = bytes.getInt(offset + 4)
                if (String(wav, offset, 4, Charsets.US_ASCII) == "data") {
                    samples = FloatArray(size / 2) { bytes.getShort(offset + 8 + it * 2) / 32768f }
                    break
                }
                offset += 8 + size + size % 2
            }
            assertTrue(samples.isNotEmpty())
            val phrases = mutableListOf<String>()
            fun feed(audio: FloatArray) {
                var pos = 0
                while (pos < audio.size) {
                    val end = minOf(pos + 1600, audio.size)
                    stream.acceptWaveform(audio.copyOfRange(pos, end), 16000)
                    while (engine.isReady(stream)) engine.decode(stream)
                    if (engine.isEndpoint(stream)) {
                        engine.getResult(stream).text.trim().takeIf { it.isNotEmpty() }?.let { phrases.add(it) }
                        engine.reset(stream)
                    }
                    pos = end
                }
            }
            feed(FloatArray(8000))
            feed(samples)
            feed(FloatArray(16000 * 12))
            feed(samples)
            feed(FloatArray(16000 * 3))
            val text = phrases.joinToString(" ").lowercase()
            android.util.Log.i("OfflineAcceptance", "Decoded sample twice: $text")
            assertTrue("No speech decoded", text.length > 20)
            assertTrue("No second phrase after silence: $phrases", phrases.size >= 2)
            // ASR wording varies with left context; both utterances must retain the known phrase.
            assertEquals("Repeated speech must remain, not be deduplicated", 2,
                Regex("yellow lamps would light up here and there").findAll(text).count())
            val expected = "after early nightfall the yellow lamps would light up here and there the squalid quarter of the brothels"
            assertEquals("First words and repeated utterance must survive silence", "$expected $expected", text)
        } finally { stream.release(); engine.release() }
    }
}
