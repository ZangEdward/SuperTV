package com.supertv.app.services

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.supertv.app.model.DLNADevice

/**
 * 投屏通知服务 - 对应原项目的 services/castNotificationService.ts
 *
 * 在系统通知栏显示投屏控制通知，支持从通知直接启动控制页面
 */
class CastNotificationService(private val context: Context) {

    companion object {
        private const val CHANNEL_ID = "cast_control"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_PLAY = "com.supertv.action.CAST_PLAY"
        private const val ACTION_PAUSE = "com.supertv.action.CAST_PAUSE"
        private const val ACTION_STOP = "com.supertv.action.CAST_STOP"
        private const val ACTION_OPEN = "com.supertv.action.CAST_OPEN"
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

    /**
     * 显示投屏控制通知
     */
    fun showCastNotification(device: DLNADevice, title: String) {
        val openIntent = Intent(ACTION_OPEN).apply {
            setPackage(context.packageName)
            putExtra("device_name", device.name)
            putExtra("device_host", device.host)
            putExtra("media_title", title)
        }

        val playIntent = Intent(ACTION_PLAY).apply { setPackage(context.packageName) }
        val pauseIntent = Intent(ACTION_PAUSE).apply { setPackage(context.packageName) }
        val stopIntent = Intent(ACTION_STOP).apply { setPackage(context.packageName) }

        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("投屏�?)
            .setContentText("正在投屏�?${device.name}: $title")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(
                PendingIntent.getBroadcast(context, 0, openIntent, pendingFlags)
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

    /**
     * 更新投屏进度
     */
    fun updateProgress(position: Long, duration: Long) {
        val minutes = position / 60000
        val seconds = (position % 60000) / 1000
        val progressText = "%02d:%02d".format(minutes, seconds)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("投屏�?)
            .setContentText(progressText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, if (duration > 0) ((position * 100) / duration).toInt() else 0, false)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    /**
     * 取消投屏通知
     */
    fun cancelNotification() {
        notificationManager.cancel(NOTIFICATION_ID)
    }
}
