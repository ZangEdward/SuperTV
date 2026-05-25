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
    private final List<Call> activeCalls = Collections.synchronizedList(new ArrayList<>());
    
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
     * 原子操作：下载并可选解密单个分片
     */
    @ReactMethod
    public void downloadSegment(
            String url,
            String destPath,
            String keyBase64,
            String ivHex,
            ReadableMap headers,
            Promise promise
    ) {
        new Thread(() -> {
            Request.Builder builder = new Request.Builder().url(url);
            if (headers != null) {
                ReadableMapKeySetIterator it = headers.keySetIterator();
                while (it.hasNextKey()) {
                    String key = it.nextKey();
                    builder.addHeader(key, headers.getString(key));
                }
            }

            Call call = client.newCall(builder.build());
            activeCalls.add(call);

            try (Response response = call.execute()) {
                if (!response.isSuccessful()) throw new IOException("HTTP " + response.code());
                
                File destFile = new File(destPath);
                destFile.getParentFile().mkdirs();

                try (InputStream is = response.body().byteStream();
                     FileOutputStream fos = new FileOutputStream(destFile)) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = is.read(buffer)) != -1) fos.write(buffer, 0, read);
                }

                // 如果有加密，在原生层高性能解密
                if (keyBase64 != null && !keyBase64.isEmpty()) {
                    decryptInPlace(destFile, keyBase64, ivHex);
                }

                activeCalls.remove(call);
                promise.resolve(destPath);
            } catch (Exception e) {
                activeCalls.remove(call);
                promise.reject("ERR", e.getMessage());
            }
        }).start();
    }

    /**
     * 原子操作：高性能合并文件列表
     */
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
                            src.delete(); // 合并后立即删除碎片
                        }
                    }
                }
                promise.resolve(destPath);
            } catch (Exception e) {
                promise.reject("ERR", e.getMessage());
            }
        }).start();
    }

    /**
     * 物理断电：立即停止所有网络请求
     */
    @ReactMethod
    public void stopAllCalls() {
        synchronized (activeCalls) {
            for (Call call : activeCalls) {
                try { call.cancel(); } catch (Exception ignored) {}
            }
            activeCalls.clear();
        }
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
