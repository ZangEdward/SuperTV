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

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class NativeDownloadModule extends ReactContextBaseJavaModule {
    public static final String NAME = "NativeDownloadModule";
    private static final String TAG = "NativeDownload";
    
    private final ExecutorService downloadPool = Executors.newFixedThreadPool(4);
    private final Map<String, AtomicBoolean> activeTasks = new ConcurrentHashMap<>();
    
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
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
            promise.resolve(destPath);
            return;
        }

        final AtomicBoolean isRunning = new AtomicBoolean(true);
        activeTasks.put(taskId, isRunning);

        new Thread(() -> {
            File tempDir = new File(getReactApplicationContext().getCacheDir(), "m3u8_native_" + taskId.replaceAll("[^a-zA-Z0-9]", "_"));
            
            try {
                if (!tempDir.exists()) tempDir.mkdirs();
                
                final int total = segmentUrls.size();
                final String[] segmentFiles = new String[total];
                final AtomicInteger completed = new AtomicInteger(0);
                final AtomicBoolean hasError = new AtomicBoolean(false);
                final String[] errorMessage = {""};

                // [SCAN] 预扫描已存在的文件，初始化进度和分片路径
                int initialCompletedCount = 0;
                for (int i = 0; i < total; i++) {
                    File f = new File(tempDir, "seg_" + i + ".ts");
                    if (f.exists() && f.length() > 0) {
                        initialCompletedCount++;
                        segmentFiles[i] = f.getAbsolutePath();
                    }
                }
                completed.set(initialCompletedCount);
                sendProgress(taskId, initialCompletedCount, total);

                // 2. Download segments in parallel using pool
                for (int i = 0; i < total; i++) {
                    final int index = i;
                    final String url = segmentUrls.getString(index);
                    
                    downloadPool.execute(() -> {
                        if (!isRunning.get() || hasError.get()) return;
                        
                        try {
                            String segmentFileName = "seg_" + index + ".ts";
                            File segFile = new File(tempDir, segmentFileName);
                            
                            // [RESUME] 如果文件不存在或不完整，重新下载
                            if (!segFile.exists() || segFile.length() == 0) {
                                int retry = 0;
                                while (retry < 3) {
                                    try {
                                        downloadFile(url, segFile, headers);
                                        if (segFile.length() > 0) break;
                                        throw new IOException("Downloaded file is empty");
                                    } catch (Exception e) {
                                        retry++;
                                        if (retry >= 3) throw e;
                                        Thread.sleep(800);
                                    }
                                }
                                
                                // 解密 (仅对新下载的文件进行解密，避免重复解密导致损坏)
                                if (keyBase64 != null && !keyBase64.isEmpty()) {
                                    if (segFile.length() % 16 == 0) {
                                        decryptInPlace(segFile, keyBase64, ivHex, index);
                                    }
                                }
                            }
                            
                            segmentFiles[index] = segFile.getAbsolutePath();
                            int done = completed.incrementAndGet();
                            
                            if (done % 5 == 0 || done == total) {
                                sendProgress(taskId, done, total);
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Segment " + index + " failed: " + e.getMessage());
                            hasError.set(true);
                            errorMessage[0] = e.getMessage();
                        }
                    });
                }

                // 3. 等待所有分片完成
                while (completed.get() < total && !hasError.get() && isRunning.get()) {
                    Thread.sleep(300);
                }

                if (!isRunning.get()) {
                    activeTasks.remove(taskId);
                    promise.reject("CANCELLED", "Task stopped by user");
                    return;
                }

                if (hasError.get()) {
                    activeTasks.remove(taskId);
                    promise.reject("DOWNLOAD_FAILED", errorMessage[0]);
                    return;
                }

                // 4. 合并分片
                File destFile = new File(destPath);
                if (destFile.exists()) destFile.delete();
                destFile.getParentFile().mkdirs();
                
                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    for (int i = 0; i < total; i++) {
                        if (segmentFiles[i] == null) {
                           throw new Exception("Missing segment file at index " + i);
                        }
                        File f = new File(segmentFiles[i]);
                        appendToFile(f, fos);
                        f.delete(); 
                    }
                }

                activeTasks.remove(taskId);
                tempDir.delete();
                promise.resolve(destPath);
                
            } catch (Exception e) {
                activeTasks.remove(taskId);
                promise.reject("DOWNLOAD_ERROR", e.getMessage());
            } finally {
                // 如果任务结束（无论是成功还是失败且不可重试），清理临时目录可以放在这里
                // 但为了支持断点续传，失败时不应删除整个目录
            }
        }).start();
    }

    @ReactMethod
    public void stopDownload(String taskId) {
        AtomicBoolean isRunning = activeTasks.get(taskId);
        if (isRunning != null) {
            isRunning.set(false);
            activeTasks.remove(taskId);
        }
    }

    private void downloadFile(String url, File dest, ReadableMap headers) throws IOException {
        Request.Builder builder = new Request.Builder().url(url);
        if (headers != null) {
            ReadableMapKeySetIterator it = headers.keySetIterator();
            while (it.hasNextKey()) {
                String key = it.nextKey();
                builder.addHeader(key, headers.getString(key));
            }
        }

        try (Response response = client.newCall(builder.build()).execute()) {
            if (!response.isSuccessful()) throw new IOException("HTTP Error " + response.code());
            try (InputStream is = response.body().byteStream();
                 FileOutputStream fos = new FileOutputStream(dest)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    fos.write(buffer, 0, read);
                }
                fos.flush();
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
            System.arraycopy(iv, 0, padded, 16 - iv.length, iv.length);
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
            int read;
            while ((read = fis.read(buffer)) != -1) dest.write(buffer, 0, read);
        }
    }

    private void sendProgress(String taskId, int current, int total) {
        WritableMap params = Arguments.createMap();
        params.putString("taskId", taskId);
        params.putDouble("progress", (double) current / total);
        params.putInt("completedCount", current);
        params.putInt("totalSegments", total);

        getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("NativeDownloadProgress", params);
    }

    private byte[] hexStringToByteArray(String s) {
        int len = s.length();
        if (len == 0) return new byte[16];
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4) + Character.digit(s.charAt(i+1), 16));
        }
        return data;
    }
}
