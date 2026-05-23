package com.supertv.app;

import android.content.Context;
import android.net.wifi.WifiManager;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = MulticastModule.NAME)
public class MulticastModule extends ReactContextBaseJavaModule {
    public static final String NAME = "MulticastModule";
    private final WifiManager.MulticastLock multicastLock;

    public MulticastModule(ReactApplicationContext reactContext) {
        super(reactContext);

        WifiManager wifi = (WifiManager) reactContext.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            multicastLock = wifi.createMulticastLock("multicastLock");
            multicastLock.setReferenceCounted(true);
        } else {
            multicastLock = null;
        }
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void acquire() {
        if (multicastLock != null && !multicastLock.isHeld()) {
            multicastLock.acquire();
        }
    }

    @ReactMethod
    public void release() {
        if (multicastLock != null && multicastLock.isHeld()) {
            multicastLock.release();
        }
    }
}
