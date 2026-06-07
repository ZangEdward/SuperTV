package com.supertv.app.services

import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.supertv.app.MainActivity
import com.supertv.app.model.DLNADevice

class CastNotificationService(private val context: Context) {

    companion object {
        private const val CHANNEL_ID = "cast_control"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_PLAY = "com.supertv.action.CAST_PLAY"
        private const val ACTION_PAUSE = "com.supertv.action.CAST_PAUSE"
        private const val ACTION_STOP = "com.supertv.action.CAST_STOP"
    }

    private var notificationManager: NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    init {
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "投屏控制",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "投屏播放控制通知"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    @SuppressLint("MissingPermission")
    fun showCastNotification(device: DLNADevice, title: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        // 内容点击：打开主页
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("device_name", device.name)
            putExtra("media_title", title)
        }

        val playIntent = Intent(ACTION_PLAY).apply { setPackage(context.packageName) }
        val pauseIntent = Intent(ACTION_PAUSE).apply { setPackage(context.packageName) }
        val stopIntent = Intent(ACTION_STOP).apply { setPackage(context.packageName) }

        val pendingFlags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("投屏中")
            .setContentText("正在投屏到 ${device.name}: $title")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(
                PendingIntent.getActivity(context, 0, openIntent, pendingFlags)
            )
            .addAction(
                android.R.drawable.ic_media_play,
                "播放",
                PendingIntent.getBroadcast(context, 1, playIntent, pendingFlags)
            )
            .addAction(
                android.R.drawable.ic_media_pause,
                "暂停",
                PendingIntent.getBroadcast(context, 2, pauseIntent, pendingFlags)
            )
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "停止",
                PendingIntent.getBroadcast(context, 3, stopIntent, pendingFlags)
            )
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    @SuppressLint("MissingPermission")
    fun updateProgress(position: Long, duration: Long) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val minutes = position / 60000
        val seconds = (position % 60000) / 1000
        val progressText = String.format(java.util.Locale.US, "%02d:%02d", minutes, seconds)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("投屏中")
            .setContentText(progressText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, if (duration > 0) ((position * 100) / duration).toInt() else 0, false)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    fun cancelNotification() {
        notificationManager.cancel(NOTIFICATION_ID)
    }
}
