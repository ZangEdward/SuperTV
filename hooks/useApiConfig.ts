import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/services/api';

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
    isValidating: true,
    isValid: null,
    error: null,
  });

  useEffect(() => {
    if (apiBaseUrl) {
      api.setBaseUrl(apiBaseUrl);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!apiBaseUrl) return;

    const validateConfig = async () => {
      setValidationState({
        isValidating: true,
        isValid: null,
        error: null,
      });

      try {
        await api.getServerConfig();
        setValidationState({
          isValidating: false,
          isValid: true,
          error: null,
        });
      } catch {
        setValidationState({
          isValidating: false,
          isValid: false,
          error: "服务器连接失败",
        });
      }
    };

    if (!isLoadingServerConfig) {
      validateConfig();
    }
  }, [apiBaseUrl, isLoadingServerConfig]);

  return {
    isConfigured: true,
    needsConfiguration: false,
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