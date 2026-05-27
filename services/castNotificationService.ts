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
 * 4. 通知被删后自动重新弹出（START_STICKY + 心跳保活）
 */
class CastNotificationService {
  private isActive = false;
  private currentTitle = '';
  private currentEpisode = '';
  private currentDeviceName = '';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_INTERVAL = 15000; // 15秒心跳

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
      this.currentTitle = title || '正在投屏';
      this.currentEpisode = episode || '';
      this.currentDeviceName = deviceName || '';
      logger.info(`[Notification] Started: "${title}" ${episode}`);

      // 启动心跳定时器：定期刷新通知，防止被系统移除后不恢复
      this.startHeartbeat();
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
      this.currentTitle = title || '正在投屏';
      this.currentEpisode = episode || '';
      this.currentDeviceName = deviceName || '';
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
      this.stopHeartbeat();

      await CastNotificationModule.stopCastNotification();
      this.isActive = false;
      this.currentTitle = '';
      this.currentEpisode = '';
      this.currentDeviceName = '';
      logger.info('[Notification] Stopped');
    } catch (error) {
      logger.error('[Notification] Failed to stop:', error);
    }
  }

  /**
   * 心跳保活：定期重新发送通知，确保被系统移除后快速恢复
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isActive || !CastNotificationModule) return;
      // 重新发送当前状态，START_STICKY 会处理通知恢复
      CastNotificationModule.startCastNotification(
        this.currentTitle,
        this.currentEpisode,
        this.currentDeviceName
      ).catch(() => {
        // 心跳失败不日志，避免刷屏
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const castNotificationService = new CastNotificationService();
