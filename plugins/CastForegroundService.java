package com.supertv.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class CastForegroundService extends Service {

    public static final String CHANNEL_ID = "cast_channel";
    public static final String CHANNEL_NAME = "投屏控制";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START = "com.supertv.app.CAST_START";
    public static final String ACTION_STOP = "com.supertv.app.CAST_STOP";
    public static final String ACTION_UPDATE = "com.supertv.app.CAST_UPDATE";

    public static final String EXTRA_TITLE = "cast_title";
    public static final String EXTRA_EPISODE = "cast_episode";
    public static final String EXTRA_DEVICE_NAME = "cast_device_name";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra(EXTRA_TITLE);
        String episode = intent.getStringExtra(EXTRA_EPISODE);
        String deviceName = intent.getStringExtra(EXTRA_DEVICE_NAME);

        if (title == null) title = "正在投屏";
        if (episode == null) episode = "";
        if (deviceName == null) deviceName = "";

        Notification notification = buildNotification(title, episode, deviceName);
        startForeground(NOTIFICATION_ID, notification);

        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("投屏播放状态通知");
            channel.setShowBadge(false);
            channel.setSound(null, null);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String title, String episode, String deviceName) {
        String contentText = episode.isEmpty() ? title : title + " · " + episode;

        Intent notificationIntent = new Intent(this, getMainActivityClass());
        notificationIntent.setAction(Intent.ACTION_MAIN);
        notificationIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        notificationIntent.putExtra("navigateTo", "cast-control");

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("📺 正在投屏")
                .setContentText(contentText)
                .setSubText(deviceName)
                .setSmallIcon(getNotificationIcon())
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        return builder.build();
    }

    private int getNotificationIcon() {
        // Use a built-in Android icon as fallback
        return android.R.drawable.ic_media_play;
    }

    private Class<?> getMainActivityClass() {
        try {
            return Class.forName("com.supertv.app.MainActivity");
        } catch (ClassNotFoundException e) {
            // Fallback for Expo managed workflow
            try {
                return Class.forName("expo.modules.core.MainActivity");
            } catch (ClassNotFoundException ex) {
                return null;
            }
        }
    }
}
