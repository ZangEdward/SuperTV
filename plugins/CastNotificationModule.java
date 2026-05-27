package com.supertv.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = CastNotificationModule.NAME)
public class CastNotificationModule extends ReactContextBaseJavaModule {
    public static final String NAME = "CastNotificationModule";

    public CastNotificationModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void startCastNotification(String title, String episode, String deviceName) {
        Context context = getReactApplicationContext();
        Intent intent = new Intent(context, CastForegroundService.class);
        intent.setAction(CastForegroundService.ACTION_START);
        intent.putExtra(CastForegroundService.EXTRA_TITLE, title);
        intent.putExtra(CastForegroundService.EXTRA_EPISODE, episode);
        intent.putExtra(CastForegroundService.EXTRA_DEVICE_NAME, deviceName);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @ReactMethod
    public void updateCastNotification(String title, String episode, String deviceName) {
        Context context = getReactApplicationContext();
        Intent intent = new Intent(context, CastForegroundService.class);
        intent.setAction(CastForegroundService.ACTION_UPDATE);
        intent.putExtra(CastForegroundService.EXTRA_TITLE, title);
        intent.putExtra(CastForegroundService.EXTRA_EPISODE, episode);
        intent.putExtra(CastForegroundService.EXTRA_DEVICE_NAME, deviceName);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @ReactMethod
    public void stopCastNotification() {
        Context context = getReactApplicationContext();
        Intent intent = new Intent(context, CastForegroundService.class);
        intent.setAction(CastForegroundService.ACTION_STOP);
        context.startService(intent);
    }

    @ReactMethod
    public void isNotificationChannelEnabled(Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getReactApplicationContext()
                    .getSystemService(NotificationManager.class);
            if (manager != null) {
                android.app.NotificationChannel channel =
                        manager.getNotificationChannel(CastForegroundService.CHANNEL_ID);
                promise.resolve(channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
                return;
            }
        }
        promise.resolve(true);
    }
}
