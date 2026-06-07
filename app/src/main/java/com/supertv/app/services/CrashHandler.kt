package com.supertv.app.services

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.util.Date

class CrashHandler(private val context: Context) : Thread.UncaughtExceptionHandler {

    private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

    init {
        Thread.setDefaultUncaughtExceptionHandler(this)
    }

    override fun uncaughtException(thread: Thread, ex: Throwable) {
        handleException(ex)
        defaultHandler?.uncaughtException(thread, ex)
    }

    private fun handleException(ex: Throwable) {
        val writer = StringWriter()
        val printWriter = PrintWriter(writer)
        ex.printStackTrace(printWriter)
        val stackTrace = writer.toString()
        
        val crashInfo = StringBuilder().apply {
            append("Time: ${Date()}\n")
            append("Device: ${Build.MANUFACTURER} ${Build.MODEL}\n")
            append("Android: ${Build.VERSION.RELEASE}\n")
            append("Exception: ${ex.message}\n")
            append("Stacktrace:\n$stackTrace\n")
        }.toString()

        Log.e("SuperTV_Crash", crashInfo)
        
        try {
            val file = File(context.getExternalFilesDir("logs"), "crash_${System.currentTimeMillis()}.log")
            file.writeText(crashInfo)
        } catch (e: Exception) {
            Log.e("SuperTV_Crash", "Failed to save crash log", e)
        }
    }
}
