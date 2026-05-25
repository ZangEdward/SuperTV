package com.supertv.app;

import android.util.Base64;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

@ReactModule(name = NativeCryptoModule.NAME)
public class NativeCryptoModule extends ReactContextBaseJavaModule {
    public static final String NAME = "NativeCryptoModule";

    public NativeCryptoModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    /**
     * 在原生线程中解密文件
     * @param filePath 文件路径
     * @param keyBase64 密钥 (Base64)
     * @param ivHex 初始向量 (Hex)
     */
    @ReactMethod
    public void decryptFileAES128CBC(String filePath, String keyBase64, String ivHex, Promise promise) {
        // 在后台线程执行，防止阻塞 RN 原生主线程
        new Thread(() -> {
            try {
                File file = new File(filePath);
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "File not found at: " + filePath);
                    return;
                }

                byte[] key = Base64.decode(keyBase64, Base64.DEFAULT);
                byte[] iv = hexStringToByteArray(ivHex.replace("0x", ""));

                // 处理 IV 长度不足 16 字节的情况
                if (iv.length < 16) {
                    byte[] paddedIv = new byte[16];
                    System.arraycopy(iv, 0, paddedIv, 0, iv.length);
                    iv = paddedIv;
                }

                SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
                IvParameterSpec ivSpec = new IvParameterSpec(iv);

                Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
                cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec);

                // 读取原始加密数据
                FileInputStream fis = new FileInputStream(file);
                byte[] input = new byte[(int) file.length()];
                fis.read(input);
                fis.close();

                // 执行解密
                byte[] output = cipher.doFinal(input);

                // 写回原文件（覆盖）
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(output);
                fos.close();

                promise.resolve(true);
            } catch (Exception e) {
                promise.reject("DECRYPT_FAILED", e.getMessage());
            }
        }).start();
    }

    private byte[] hexStringToByteArray(String s) {
        int len = s.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4)
                                 + Character.digit(s.charAt(i+1), 16));
        }
        return data;
    }
}
