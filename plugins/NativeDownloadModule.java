package com.supertv.app;

import android.util.Base64;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
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
     * 原子任务：下载并解密单个片段
     * 完成后通过 Promise 异步通知 JS
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
                    int n;
                    while ((n = is.read(buffer)) != -1) fos.write(buffer, 0, n);
                }

                // 实时解密，不占 JS 线程
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

    @ReactMethod
    public void stopAllCalls() {
        synchronized (activeCalls) {
            for (Call call : activeCalls) {
                try { call.cancel(); } catch (Exception ignored) {}
            }
            activeCalls.clear();
        }
    }

    @ReactMethod
    public void mergeSegments(com.facebook.react.bridge.ReadableArray paths, String dest, Promise promise) {
        new Thread(() -> {
            try {
                File d = new File(dest);
                d.getParentFile().mkdirs();
                try (FileOutputStream fos = new FileOutputStream(d)) {
                    for (int i = 0; i < paths.size(); i++) {
                        File s = new File(paths.getString(i));
                        if (s.exists()) {
                            appendToFile(s, fos);
                            s.delete();
                        }
                    }
                }
                promise.resolve(dest);
            } catch (Exception e) {
                promise.reject("ERR", e.getMessage());
            }
        }).start();
    }

    private void decryptInPlace(File file, String keyBase64, String ivHex) throws Exception {
        byte[] key = Base64.decode(keyBase64, Base64.DEFAULT);
        byte[] iv = hexStringToByteArray(ivHex != null ? ivHex.replace("0x", "") : "");
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

    private byte[] hexStringToByteArray(String s) {
        int len = s.length();
        if (len == 0) return new byte[16];
        byte[] d = new byte[len / 2];
        for (int i = 0; i < len; i += 2) d[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4) + Character.digit(s.charAt(i+1), 16));
        return d;
    }
}
