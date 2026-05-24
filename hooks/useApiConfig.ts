import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/services/api';
import Logger from '@/utils/Logger';

const logger = Logger.withTag('useApiConfig');

export interface ApiConfigStatus {
  isConfigured: boolean;
  isValidating: boolean;
  isValid: boolean | null;
  error: string | null;
  needsConfiguration: boolean;
}

export const useApiConfig = () => {
  const { apiBaseUrl, serverConfig, isLoadingServerConfig } = useSettingsStore();
  const [validationState, setValidationState] = useState({
    isValidating: false, // 初始设为 false，防止在 apiBaseUrl 为空时一直显示验证中
    isValid: null,
    error: null,
  });

  useEffect(() => {
    if (apiBaseUrl) {
      api.setBaseUrl(apiBaseUrl);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    // 如果没有 API URL，不需要验证
    if (!apiBaseUrl) {
      setValidationState({
        isValidating: false,
        isValid: null,
        error: null,
      });
      return;
    }

    const validateConfig = async () => {
      // 如果已经有 serverConfig 且当前 apiBaseUrl 匹配，可以跳过验证或直接设为有效
      if (serverConfig && !isLoadingServerConfig) {
        setValidationState({
          isValidating: false,
          isValid: true,
          error: null,
        });
        return;
      }

      setValidationState(prev => ({ ...prev, isValidating: true }));

      try {
        await api.getServerConfig();
        setValidationState({
          isValidating: false,
          isValid: true,
          error: null,
        });
      } catch (err) {
        // 只有在确定失败时才报错，网络波动可能导致临时失败
        logger.warn("[useApiConfig] Validation failed:", err);
        setValidationState({
          isValidating: false,
          isValid: false,
          error: "服务器连接失败，请检查网络或节点设置",
        });
      }
    };

    validateConfig();
  }, [apiBaseUrl, serverConfig, isLoadingServerConfig]);

  return {
    isConfigured: !!apiBaseUrl,
    needsConfiguration: !apiBaseUrl,
    isValidating: validationState.isValidating || isLoadingServerConfig,
    isValid: validationState.isValid,
    error: validationState.error,
  };
};

export const getApiConfigErrorMessage = (status: ApiConfigStatus): string => {
  if (status.error) return status.error;
  if (status.isValidating) return '正在验证服务器配置...';
  if (status.isValid === false) return '服务器配置验证失败，请检查设置';
  return '加载失败，请重试';
};