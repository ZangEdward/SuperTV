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
            promise.reject("TASK_EXISTS", "Task already running: " + taskId);
            return;
        }

        final AtomicBoolean isRunning = new AtomicBoolean(true);
        activeTasks.put(taskId, isRunning);

        new Thread(() -> {
            File destFile = new File(destPath);
            File tempDir = new File(getReactApplicationContext().getCacheDir(), "m3u8_native_" + taskId);
            
            try {
                if (!tempDir.exists()) tempDir.mkdirs();
                
                // 1. Prepare segments list
                final int total = segmentUrls.size();
                final String[] segmentFiles = new String[total];
                final AtomicInteger completed = new AtomicInteger(0);
                final AtomicBoolean hasError = new AtomicBoolean(false);
                final String[] errorMessage = {null};

                // 2. Download segments in parallel using pool
                for (int i = 0; i < total; i++) {
                    final int index = i;
                    final String url = segmentUrls.getString(i);
                    
                    downloadPool.execute(() -> {
                        if (!isRunning.get() || hasError.get()) return;
                        
                        try {
                            String segmentFileName = "seg_" + index + ".ts";
                            File segFile = new File(tempDir, segmentFileName);

                            // Download with retry logic
                            int retry = 0;
                            while (retry < 3) {
                                try {
                                    downloadFile(url, segFile, headers);
                                    
                                    // 关键修复：如果文件长度为 0，视为下载失败触发重试
                                    if (segFile.length() == 0) {
                                        throw new Exception("Downloaded empty file");
                                    }
                                    break; 
                                } catch (Exception e) {
                                    retry++;
                                    if (retry >= 3) throw e;
                                    Thread.sleep(800); 
                                }
                            }

                            // Decrypt if needed
                            if (keyBase64 != null && !keyBase64.isEmpty()) {
                                long len = segFile.length();
                                // HLS 规范：加密片段必须是 16 字节倍数。如果不满足，极大概率是该片段本身未加密。
                                if (len > 0 && len % 16 == 0) {
                                    // 这里的 ivHex 如果是以 taskId_index 形式传过来的，说明需要动态计算序列号 IV
                                    String finalIv = ivHex;
                                    if (ivHex != null && ivHex.startsWith("SEQ:")) {
                                        int seq = Integer.parseInt(ivHex.substring(4)) + index;
                                        finalIv = String.format("%032x", seq);
                                    }
                                    decryptInPlace(segFile, keyBase64, finalIv);
                                } else {
                                    Log.w(TAG, "Segment " + index + " length " + len + " is not multiple of 16, skipping decryption.");
                                }
                            }
                            
                            segmentFiles[index] = segFile.getAbsolutePath();
                            int done = completed.incrementAndGet();
                            
                            // Throttled progress reporting (every 5% or so)
                            if (done % 5 == 0 || done == total) {
                                sendProgress(taskId, done, total);
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Segment " + index + " failed", e);
                            hasError.set(true);
                            errorMessage[0] = e.getMessage();
                        }
                    });
                }

                // 3. Wait for downloads to finish
                while (completed.get() < total && !hasError.get() && isRunning.get()) {
                    Thread.sleep(200);
                }

                if (!isRunning.get()) {
                    throw new Exception("Download cancelled");
                }
                if (hasError.get()) {
                    throw new Exception(errorMessage[0]);
                }

                // 4. Merge segments into final file
                Log.d(TAG, "Merging segments into " + destPath);
                destFile.getParentFile().mkdirs();
                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    for (int i = 0; i < total; i++) {
                        File f = new File(segmentFiles[i]);
                        appendToFile(f, fos);
                        f.delete(); // Delete temp segment after merging
                    }
                }

                activeTasks.remove(taskId);
                tempDir.delete();
                promise.resolve(destPath);
                
            } catch (Exception e) {
                Log.e(TAG, "Download task failed: " + taskId, e);
                activeTasks.remove(taskId);
                promise.reject("DOWNLOAD_FAILED", e.getMessage());
            } finally {
                // Cleanup temp files
                deleteRecursive(tempDir);
            }
        }).start();
    }

    @ReactMethod
    public void stopDownload(String taskId) {
        AtomicBoolean isRunning = activeTasks.get(taskId);
        if (isRunning != null) {
            isRunning.set(false);
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
            if (!response.isSuccessful()) throw new IOException("Http Error: " + response.code());
            
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

    private void decryptInPlace(File file, String keyBase64, String ivHex) throws Exception {
        byte[] key = Base64.decode(keyBase64, Base64.DEFAULT);
        byte[] iv = hexStringToByteArray(ivHex != null ? ivHex.replace("0x", "") : "");
        
        // HLS 规范：如果 IV 不足 16 字节，必须在左侧（高位）补零
        if (iv.length < 16) {
            byte[] padded = new byte[16];
            System.arraycopy(iv, 0, padded, 16 - iv.length, iv.length);
            iv = padded;
        }

        SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(iv);
        
        // 使用更通用的 PKCS7Padding (Java 中 PKCS5 等同于 PKCS7)
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec);

        // 使用更健壮的读取方式
        byte[] input = new byte[(int) file.length()];
        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) {
            int offset = 0;
            int numRead;
            while (offset < input.length && (numRead = fis.read(input, offset, input.length - offset)) >= 0) {
                offset += numRead;
            }
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
            while ((read = fis.read(buffer)) != -1) {
                dest.write(buffer, 0, read);
            }
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
            data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4)
                                 + Character.digit(s.charAt(i+1), 16));
        }
        return data;
    }

    private void deleteRecursive(File fileOrDirectory) {
        if (fileOrDirectory.isDirectory()) {
            for (File child : fileOrDirectory.listFiles()) {
                deleteRecursive(child);
            }
        }
        fileOrDirectory.delete();
    }
}
