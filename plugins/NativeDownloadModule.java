package com.supertv.app;

import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class NativeDownloadModule extends ReactContextBaseJavaModule {
    public static final String NAME = "NativeDownloadModule";
    private static final String TAG = "NativeDownload";
    
    private final ExecutorService downloadPool = Executors.newFixedThreadPool(4);
    private final Map<String, AtomicBoolean> activeTasks = new ConcurrentHashMap<>();
    private final Map<String, List<Call>> activeCalls = new ConcurrentHashMap<>();
    
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build();

    public NativeDownloadModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void startM3U8Download(
            final String taskId,
            final ReadableArray segmentUrls,
            final String destPath,
            final String keyBase64,
            final String ivHex,
            final ReadableMap headers,
            final Promise promise
    ) {
        if (activeTasks.containsKey(taskId)) {
            Log.d(TAG, "Task already running: " + taskId);
            return; 
        }

        final AtomicBoolean isRunning = new AtomicBoolean(true);
        activeTasks.put(taskId, isRunning);
        activeCalls.put(taskId, Collections.synchronizedList(new ArrayList<>()));

        new Thread(() -> {
            File tempDir = new File(getReactApplicationContext().getCacheDir(), "m3u8_native_" + taskId.replaceAll("[^a-zA-Z0-9]", "_"));
            if (!tempDir.exists()) tempDir.mkdirs();

            try {
                final int total = segmentUrls.size();
                final String[] segmentFiles = new String[total];
                final AtomicInteger completed = new AtomicInteger(0);
                final AtomicBoolean hasError = new AtomicBoolean(false);

                // 1. [SCAN] 预扫描
                for (int i = 0; i < total; i++) {
                    File f = new File(tempDir, "seg_" + i + ".ts");
                    if (f.exists() && f.length() > 0) {
                        completed.incrementAndGet();
                        segmentFiles[i] = f.getAbsolutePath();
                    }
                }
                sendProgress(taskId, completed.get(), total);

                // 2. [DOWNLOAD] 下载循环
                for (int i = 0; i < total; i++) {
                    if (!isRunning.get() || hasError.get()) break;
                    final int index = i;
                    if (segmentFiles[index] != null) continue;

                    downloadPool.execute(() -> {
                        if (!isRunning.get() || hasError.get()) return;
                        try {
                            File segFile = new File(tempDir, "seg_" + index + ".ts");
                            downloadWithRetry(taskId, segmentUrls.getString(index), segFile, headers);
                            if (keyBase64 != null && !keyBase64.isEmpty()) {
                                decryptInPlace(segFile, keyBase64, ivHex, index);
                            }
                            segmentFiles[index] = segFile.getAbsolutePath();
                            int done = completed.incrementAndGet();
                            if (done % 5 == 0 || done == total) sendProgress(taskId, done, total);
                        } catch (Exception e) {
                            if (isRunning.get()) {
                                Log.e(TAG, "Segment " + index + " failed: " + e.getMessage());
                                hasError.set(true);
                            }
                        }
                    });
                }

                while (completed.get() < total && !hasError.get() && isRunning.get()) {
                    Thread.sleep(300);
                }

                if (!isRunning.get()) {
                    activeTasks.remove(taskId);
                    activeCalls.remove(taskId);
                    promise.reject("PAUSED", "Task paused by user");
                    return;
                }

                if (hasError.get()) {
                    activeTasks.remove(taskId);
                    activeCalls.remove(taskId);
                    promise.reject("ERROR", "Download failed");
                    return;
                }

                // 合并
                File destFile = new File(destPath);
                destFile.getParentFile().mkdirs();
                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    for (String path : segmentFiles) {
                        if (path != null) appendToFile(new File(path), fos);
                    }
                }
                deleteRecursive(tempDir);
                
                activeTasks.remove(taskId);
                activeCalls.remove(taskId);
                promise.resolve(destPath);
            } catch (Exception e) {
                activeTasks.remove(taskId);
                activeCalls.remove(taskId);
                promise.reject("FATAL", e.getMessage());
            }
        }).start();
    }

    @ReactMethod
    public void stopDownload(String taskId) {
        AtomicBoolean isRunning = activeTasks.remove(taskId);
        if (isRunning != null) {
            isRunning.set(false);
        }
        List<Call> calls = activeCalls.remove(taskId);
        if (calls != null) {
            synchronized (calls) {
                for (Call call : calls) try { call.cancel(); } catch (Exception ignored) {}
                calls.clear();
            }
        }
    }

    private void downloadWithRetry(String taskId, String url, File dest, ReadableMap headers) throws IOException {
        int retry = 0;
        while (retry < 3) {
            try {
                Request.Builder builder = new Request.Builder().url(url);
                if (headers != null) {
                    ReadableMapKeySetIterator it = headers.keySetIterator();
                    while (it.hasNextKey()) {
                        String k = it.nextKey();
                        builder.addHeader(k, headers.getString(k));
                    }
                }
                Call call = client.newCall(builder.build());
                List<Call> list = activeCalls.get(taskId);
                if (list != null) list.add(call);
                try (Response res = call.execute()) {
                    if (list != null) list.remove(call);
                    if (!res.isSuccessful()) throw new IOException("HTTP " + res.code());
                    try (InputStream is = res.body().byteStream(); FileOutputStream fos = new FileOutputStream(dest)) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = is.read(buf)) != -1) fos.write(buf, 0, n);
                    }
                }
                return;
            } catch (IOException e) {
                retry++;
                if (retry >= 3) throw e;
            }
        }
    }

    private void decryptInPlace(File file, String keyBase64, String ivHex, int index) throws Exception {
        byte[] key = Base64.decode(keyBase64, Base64.DEFAULT);
        String fIvHex = ivHex;
        if (ivHex != null && ivHex.startsWith("SEQ:")) {
            fIvHex = String.format("%032x", Integer.parseInt(ivHex.substring(4)) + index);
        }
        byte[] iv = hexStringToByteArray(fIvHex != null ? fIvHex.replace("0x", "") : "");
        if (iv.length < 16) {
            byte[] p = new byte[16];
            System.arraycopy(iv, 0, p, 16 - iv.length, iv.length);
            iv = p;
        }
        SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(iv);
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec);
        byte[] input = new byte[(int) file.length()];
        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) {
            int off = 0, n;
            while (off < input.length && (n = fis.read(input, off, input.length - off)) >= 0) off += n;
        }
        byte[] output = cipher.doFinal(input);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(output);
        }
    }

    private void appendToFile(File src, FileOutputStream dest) throws IOException {
        try (java.io.FileInputStream fis = new java.io.FileInputStream(src)) {
            byte[] buf = new byte[32768];
            int n;
            while ((n = fis.read(buf)) != -1) dest.write(buf, 0, n);
        }
    }

    private void sendProgress(String taskId, int current, int total) {
        WritableMap p = Arguments.createMap();
        p.putString("taskId", taskId);
        p.putDouble("progress", (double) current / total);
        p.putInt("completedCount", current);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("NativeDownloadProgress", p);
    }

    private byte[] hexStringToByteArray(String s) {
        int len = s.length();
        if (len == 0) return new byte[16];
        byte[] d = new byte[len / 2];
        for (int i = 0; i < len; i += 2) d[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4) + Character.digit(s.charAt(i+1), 16));
        return d;
    }

    private void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] c = f.listFiles();
            if (c != null) for (File child : c) deleteRecursive(child);
        }
        f.delete();
    }
}
