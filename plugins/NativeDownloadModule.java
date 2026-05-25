package com.supertv.app;

import android.util.Base64;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;

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

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class NativeDownloadModule extends ReactContextBaseJavaModule {
    public static final String NAME = "NativeDownloadModule";
    
    // 线程池：4路并发
    private final ExecutorService downloadPool = Executors.newFixedThreadPool(4);
    
    // 存储 taskId -> 该任务下的所有活跃 Call
    private final Map<String, List<Call>> taskCalls = new ConcurrentHashMap<>();
    
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build();

    public NativeDownloadModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    /**
     * 原子任务：下载并解密单个片段
     * @param taskId 用于追踪和取消
     */
    @ReactMethod
    public void downloadSegment(
            final String taskId,
            final String url,
            final String destPath,
            final String keyBase64,
            final String ivHex,
            final ReadableMap headers,
            final Promise promise
    ) {
        // 使用线程池处理，而不是每次创建新线程
        downloadPool.execute(() -> {
            Request.Builder builder = new Request.Builder().url(url);
            if (headers != null) {
                ReadableMapKeySetIterator it = headers.keySetIterator();
                while (it.hasNextKey()) {
                    String key = it.nextKey();
                    builder.addHeader(key, headers.getString(key));
                }
            }

            Call call = client.newCall(builder.build());
            
            // 注册 Call 到任务列表
            List<Call> calls = taskCalls.get(taskId);
            if (calls == null) {
                calls = Collections.synchronizedList(new ArrayList<>());
                taskCalls.put(taskId, calls);
            }
            calls.add(call);

            try (Response response = call.execute()) {
                if (!response.isSuccessful()) throw new IOException("HTTP " + response.code());
                
                File destFile = new File(destPath);
                destFile.getParentFile().mkdirs();

                try (InputStream is = response.body().byteStream();
                     FileOutputStream fos = new FileOutputStream(destFile)) {
                    byte[] buffer = new byte[16384];
                    int n;
                    while ((n = is.read(buffer)) != -1) fos.write(buffer, 0, n);
                }

                // 实时解密
                if (keyBase64 != null && !keyBase64.isEmpty()) {
                    decryptInPlace(destFile, keyBase64, ivHex);
                }

                calls.remove(call);
                promise.resolve(destPath);
            } catch (Exception e) {
                if (calls != null) calls.remove(call);
                promise.reject("ERR", e.getMessage());
            }
        });
    }

    /**
     * 停止特定任务的所有下载
     */
    @ReactMethod
    public void stopDownload(String taskId) {
        List<Call> calls = taskCalls.remove(taskId);
        if (calls != null) {
            synchronized (calls) {
                for (Call call : calls) {
                    try { call.cancel(); } catch (Exception ignored) {}
                }
                calls.clear();
            }
        }
    }

    /**
     * 停止所有下载（清空缓存时使用）
     */
    @ReactMethod
    public void stopAllCalls() {
        for (String tid : taskCalls.keySet()) {
            stopDownload(tid);
        }
    }

    @ReactMethod
    public void mergeSegments(ReadableArray filePaths, String destPath, Promise promise) {
        new Thread(() -> {
            try {
                File destFile = new File(destPath);
                destFile.getParentFile().mkdirs();
                if (destFile.exists()) destFile.delete();

                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    for (int i = 0; i < filePaths.size(); i++) {
                        File src = new File(filePaths.getString(i));
                        if (src.exists()) {
                            appendToFile(src, fos);
                            src.delete();
                        }
                    }
                }
                promise.resolve(destPath);
            } catch (Exception e) {
                promise.reject("ERR", e.getMessage());
            }
        }).start();
    }

    private void decryptInPlace(File file, String keyBase64, String ivHex) throws Exception {
        byte[] key = Base64.decode(keyBase64, Base64.DEFAULT);
        byte[] iv = hexStringToByteArray(ivHex != null ? ivHex.replace("0x", "") : "");
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
            int n;
            while ((n = fis.read(buffer)) != -1) dest.write(buffer, 0, n);
        }
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
