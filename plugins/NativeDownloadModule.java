package com.supertv.app;

import android.util.Base64;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class NativeDownloadModule extends ReactContextBaseJavaModule {
    public static final String NAME = "NativeDownloadModule";
    private final ExecutorService workerPool = Executors.newFixedThreadPool(4);

    public NativeDownloadModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    /**
     * 在原生层解密文件 (解密后覆盖原文件)
     */
    @ReactMethod
    public void decryptFileInPlace(String filePath, String keyBase64, String ivHex, Promise promise) {
        workerPool.execute(() -> {
            try {
                File file = new File(filePath);
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
                promise.resolve(true);
            } catch (Exception e) {
                promise.reject("DECRYPT_ERR", e.getMessage());
            }
        });
    }

    /**
     * 高性能文件合并
     */
    @ReactMethod
    public void mergeFiles(ReadableArray filePaths, String destPath, Promise promise) {
        workerPool.execute(() -> {
            try {
                File destFile = new File(destPath);
                destFile.getParentFile().mkdirs();
                if (destFile.exists()) destFile.delete();

                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    for (int i = 0; i < filePaths.size(); i++) {
                        File src = new File(filePaths.getString(i));
                        if (src.exists()) {
                            appendToFile(src, fos);
                            src.delete(); // 合并后立即删除分片
                        }
                    }
                }
                promise.resolve(destPath);
            } catch (Exception e) {
                promise.reject("MERGE_ERR", e.getMessage());
            }
        });
    }

    private void appendToFile(File src, FileOutputStream dest) throws IOException {
        try (java.io.FileInputStream fis = new java.io.FileInputStream(src)) {
            byte[] buf = new byte[65536];
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
