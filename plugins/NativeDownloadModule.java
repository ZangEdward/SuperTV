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
        // [防重触发] 如果任务已经在跑，直接返回，不干扰进度
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

                // 1. [SCAN] 预扫描磁盘已有分片，校准初始进度
                for (int i = 0; i < total; i++) {
                    File f = new File(tempDir, "seg_" + i + ".ts");
                    if (f.exists() && f.length() > 0) {
                        completed.incrementAndGet();
                        segmentFiles[i] = f.getAbsolutePath();
                    }
                }
                sendProgress(taskId, completed.get(), total);

                // 2. [DOWNLOAD] 进入多线程下载循环
                for (int i = 0; i < total; i++) {
                    if (!isRunning.get() || hasError.get()) break;
                    
                    final int index = i;
                    if (segmentFiles[index] != null) continue; // 跳过已下载的

                    downloadPool.execute(() -> {
                        if (!isRunning.get() || hasError.get()) return;
                        
                        try {
                            File segFile = new File(tempDir, "seg_" + index + ".ts");
                            
                            // 执行下载
                            downloadWithRetry(taskId, segmentUrls.getString(index), segFile, headers);
                            
                            // 解密
                            if (keyBase64 != null && !keyBase64.isEmpty()) {
                                decryptInPlace(segFile, keyBase64, ivHex, index);
                            }
                            
                            segmentFiles[index] = segFile.getAbsolutePath();
                            int done = completed.incrementAndGet();
                            
                            if (done % 5 == 0 || done == total) {
                                sendProgress(taskId, done, total);
                            }
                        } catch (Exception e) {
                            if (isRunning.get()) {
                                Log.e(TAG, "Segment " + index + " failed: " + e.getMessage());
                                hasError.set(true);
                            }
                        }
                    });
                }

                // 3. [WAIT] 等待所有 worker 退出
                while (completed.get() < total && !hasError.get() && isRunning.get()) {
                    Thread.sleep(300);
                }

                // 4. [FINALIZE] 合并或退出
                if (!isRunning.get()) {
                    promise.reject("PAUSED", "Task paused by user");
                } else if (hasError.get()) {
                    promise.reject("ERROR", "Download interrupted");
                } else {
                    File destFile = new File(destPath);
                    destFile.getParentFile().mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(destFile)) {
                        for (String path : segmentFiles) {
                            appendToFile(new File(path), fos);
                        }
                    }
                    deleteRecursive(tempDir);
                    promise.resolve(destPath);
                }
            } catch (Exception e) {
                promise.reject("FATAL", e.getMessage());
            } finally {
                activeTasks.remove(taskId);
                activeCalls.remove(taskId);
            }
        }).start();
    }

    @ReactMethod
    public void stopDownload(String taskId) {
        AtomicBoolean isRunning = activeTasks.get(taskId);
        if (isRunning != null) {
            isRunning.set(false);
        }
        // [关键] 物理掐断所有活跃的网络连接
        List<Call> calls = activeCalls.get(taskId);
        if (calls != null) {
            synchronized (calls) {
                for (Call call : calls) call.cancel();
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
                        String key = it.nextKey();
                        builder.addHeader(key, headers.getString(key));
                    }
                }
                Call call = client.newCall(builder.build());
                List<Call> list = activeCalls.get(taskId);
                if (list != null) list.add(call);

                try (Response res = call.execute()) {
                    if (list != null) list.remove(call);
                    if (!res.isSuccessful()) throw new IOException("HTTP " + res.code());
                    try (InputStream is = res.body().byteStream(); FileOutputStream fos = new FileOutputStream(dest)) {
                        byte[] buffer = new byte[16384];
                        int n;
                        while ((n = is.read(buffer)) != -1) fos.write(buffer, 0, n);
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
        String finalIvHex = ivHex;
        if (ivHex != null && ivHex.startsWith("SEQ:")) {
            int seq = Integer.parseInt(ivHex.substring(4)) + index;
            finalIvHex = String.format("%032x", seq);
        }
        byte[] iv = hexStringToByteArray(finalIvHex != null ? finalIvHex.replace("0x", "") : "");
        if (iv.length < 16) {
            byte[] padded = new byte[16];
            System.arraycopy(iv, 0, 16 - iv.length, iv.length);
            iv = padded;
        }
        SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(iv);
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec);
        byte[] input = new byte[(int) file.length()];
        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) {
            int offset = 0, n;
            while (offset < input.length && (n = fis.read(input, offset, input.length - offset)) >= 0) offset += n;
        }
        byte[] output = cipher.doFinal(input);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(output);
        }
    }

    private void appendToFile(File src, FileOutputStream dest) throws IOException {
        try (java.io.FileInputStream fis = new java.io.FileInputStream(src)) {
            byte[] buffer = new byte[32768];
            int n;
            while ((n = fis.read(buffer)) != -1) dest.write(buffer, 0, n);
        }
    }

    private void sendProgress(String taskId, int current, int total) {
        WritableMap params = Arguments.createMap();
        params.putString("taskId", taskId);
        params.putDouble("progress", (double) current / total);
        params.putInt("completedCount", current);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("NativeDownloadProgress", params);
    }

    private byte[] hexStringToByteArray(String s) {
        int len = s.length();
        if (len == 0) return new byte[16];
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4) + Character.digit(s.charAt(i+1), 16));
        return data;
    }

    private void deleteRecursive(File fileOrDirectory) {
        if (fileOrDirectory.isDirectory()) {
            File[] children = fileOrDirectory.listFiles();
            if (children != null) for (File child : children) deleteRecursive(child);
        }
        fileOrDirectory.delete();
    }
}
