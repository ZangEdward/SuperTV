import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/services/api';

const DEFAULT_API = "https://tv.lzsb.edu.eu.org/n.json";

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
    isValidating: false,
    isValid: null,
    error: null,
  });

  // 自动使用默认 API
  const finalApiUrl = apiBaseUrl?.trim() || DEFAULT_API;
  api.setBaseUrl(finalApiUrl);

  const isConfigured = true; // 永远视为已配置
  const needsConfiguration = false;

  useEffect(() => {
    const validateConfig = async () => {
      setValidationState(prev => ({ ...prev, isValidating: true, error: null }));

      try {
        await api.getServerConfig();
        setValidationState({
          isValidating: false,
          isValid: true,
          error: null,
        });
      } catch (error) {
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
  }, [finalApiUrl, isLoadingServerConfig]);

  const status: ApiConfigStatus = {
    isConfigured,
    isValidating: validationState.isValidating || isLoadingServerConfig,
    isValid: validationState.isValid,
    error: validationState.error,
    needsConfiguration,
  };

  return status;
};

export const getApiConfigErrorMessage = (status: ApiConfigStatus): string => {
  if (status.error) return status.error;
  if (status.isValidating) return '正在验证服务器配置...';
  if (status.isValid === false) return '服务器配置验证失败，请检查设置';
  return '加载失败，请重试';
};
