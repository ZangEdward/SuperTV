import { Platform, NativeModules } from 'react-native';
import Logger from '@/utils/Logger';

const logger = Logger.withTag('CastNotificationService');

const { CastNotificationModule } = NativeModules;

/**
 * 投屏通知栏服务
 * 在投屏期间显示前台服务通知，用于：
 * 1. 显示当前投屏内容（剧名 + 集数）
 * 2. 提供快速回到投屏控制页的入口
 * 3. 防止应用被系统杀死（前台服务保活）
 */
class CastNotificationService {
  private isActive = false;

  /**
   * 启动投屏通知（前台服务）
   */
  async start(title: string, episode: string, deviceName: string) {
    if (Platform.OS !== 'android') return;
    if (!CastNotificationModule) {
      logger.warn('[Notification] CastNotificationModule not available');
      return;
    }

    try {
      await CastNotificationModule.startCastNotification(
        title || '正在投屏',
        episode || '',
        deviceName || ''
      );
      this.isActive = true;
      logger.info(`[Notification] Started: "${title}" ${episode}`);
    } catch (error) {
      logger.error('[Notification] Failed to start:', error);
    }
  }

  /**
   * 更新通知内容（换集时调用）
   */
  async update(title: string, episode: string, deviceName: string) {
    if (Platform.OS !== 'android' || !this.isActive) return;
    if (!CastNotificationModule) return;

    try {
      await CastNotificationModule.updateCastNotification(
        title || '正在投屏',
        episode || '',
        deviceName || ''
      );
      logger.info(`[Notification] Updated: "${title}" ${episode}`);
    } catch (error) {
      logger.error('[Notification] Failed to update:', error);
    }
  }

  /**
   * 停止投屏通知并关闭前台服务
   */
  async stop() {
    if (Platform.OS !== 'android' || !this.isActive) return;
    if (!CastNotificationModule) return;

    try {
      await CastNotificationModule.stopCastNotification();
      this.isActive = false;
      logger.info('[Notification] Stopped');
    } catch (error) {
      logger.error('[Notification] Failed to stop:', error);
    }
  }
}

export const castNotificationService = new CastNotificationService();
