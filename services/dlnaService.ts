import TcpSocket from 'react-native-tcp-socket';
import Logger from '@/utils/Logger';

const logger = Logger.withTag('DLNAService');

export interface DLNADevice {
  id: string;
  name: string;
  host: string;
  port: number;
  controlUrl: string;
  descriptionUrl: string;
}

/**
 * 基于 Cling (4thline) 设计思路重构的 DLNA/SSDP 服务
 * 改进点：
 *   - 轮询 M-SEARCH (0s, 1s, 3s, 6s, 10s) — Cling 的 MultipleSearchAndNotifyListener
 *   - 持续监听多播消息（M-SEARCH response + NOTIFY ssdp:alive）
 *   - 绑定到 1900 端口，若失败则尝试其他端口（但通知发送到 1900）
 *   - 处理 ssdp:byebye 自动移除设备
 *   - 修正 XML 元数据转义问题（仅转义文本内容，保留 XML 结构）
 *   - 支持带 CDATA 的 CurrentURIMetaData 投送
 *   - 增强：加入持续 alive 监听（NOTIFY），类似 Cling 的 AliveListener
 *   - 增强：重复 M-SEARCH 直到收到首个响应，类似 Cling 的重试机制
 */
class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private searchTimeout: any = null;
  private listenClient: any = null;
  private searchTimers: any[] = [];
  private scanning = false;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;
  private receivedKeys: Set<string> = new Set();
  /** 连续搜索+监听时的响应用来重置计时器 */
  private lastResponseTime: number = 0;

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  /** Cling 风格: 搜索轮询间隔 (ms) */
  private readonly SEARCH_INTERVALS = [0, 1000, 2000, 4000, 8000, 12000];
  /** 总搜索超时 (ms) */
  private readonly SEARCH_TIMEOUT = 18000;
  /** 无响应超时：如果 3.5 秒没收到任何响应，重发 M-SEARCH (Cling 的 BACKOFF) */
  private readonly BACKOFF_TIMEOUT = 3500;
  private backoffTimer: any = null;

  constructor() {}

  public getDevices(): DLNADevice[] {
    return Array.from(this.devices.values());
  }

  public searchDevices(callback: (devices: DLNADevice[]) => void) {
    if (this.scanning) {
      this.stopSearch();
    }
    this.scanning = true;
    this.currentCallback = callback;
    this.receivedKeys.clear();
    this.lastResponseTime = Date.now();

    logger.info('Starting DLNA device search (Cling-inspired multi-search)...');
    this.devices.clear();

    // 1. 启动监听
    this.startListenSocket(() => {
      // 2. 按 Cling 的 MultipleSearchAndNotifyListener 风格发 M-SEARCH
      this.fireMultiSearch();
    });

    // 3. 总超时
    this.searchTimeout = setTimeout(() => {
      this.stopSearch();
      if (this.currentCallback) {
        this.currentCallback(this.getDevices());
      }
    }, this.SEARCH_TIMEOUT);
  }

  public stopSearch() {
    this.scanning = false;
    this.currentCallback = null;

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }

    this.searchTimers.forEach(t => clearTimeout(t));
    this.searchTimers = [];

    this.stopListenSocket();
  }

  private stopListenSocket() {
    if (this.listenClient) {
      try {
        this.listenClient.close();
      } catch (e) {}
      this.listenClient = null;
    }
  }

  /** Cling 风格: 按延迟队列发送多次 M-SEARCH */
  private fireMultiSearch() {
    this.SEARCH_INTERVALS.forEach((delay) => {
      const timer = setTimeout(() => {
        if (!this.scanning) return;
        this.broadcastMSEARCH();
        this.lastResponseTime = Date.now();
      }, delay);
      this.searchTimers.push(timer);
    });
  }

  /**
   * 后备重试：如果连续 BACKOFF_TIMEOUT 毫秒没收到响应，重新发送 M-SEARCH
   * 类似 Cling 的 SearchAndNotifyListener 的 BACKOFF 策略
   */
  private scheduleBackoffRetry() {
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    if (!this.scanning) return;

    this.backoffTimer = setTimeout(() => {
      if (!this.scanning) return;
      const elapsed = Date.now() - this.lastResponseTime;
      // 如果距离上次响应或上次发送已经过了 BACKOFF_TIMEOUT，重试
      if (elapsed >= this.BACKOFF_TIMEOUT) {
        logger.info('[DLNA] No responses in ' + elapsed + 'ms, re-sending M-SEARCH (backoff)');
        this.broadcastMSEARCH();
        this.lastResponseTime = Date.now();
        this.scheduleBackoffRetry(); // 继续检查
      } else {
        this.scheduleBackoffRetry();
      }
    }, this.BACKOFF_TIMEOUT);
  }

  private startListenSocket(onReady: () => void) {
    try {
      const socket = TcpSocket.createUdpSocket('udp4');
      this.listenClient = socket;

      socket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        if (!this.scanning) return;
        if (rinfo.address.startsWith('127.') || rinfo.address === '0.0.0.0') return;

        const data = msg.toString();
        // 更新响应时间（任何消息都算活跃）
        this.lastResponseTime = Date.now();
        this.scheduleBackoffRetry();

        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY')) {
          const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
          const ntsMatch = data.match(/NTS:\s*(.+?)[\r\n]/i);

          if (locationMatch && locationMatch[1]) {
            const isByeBye = ntsMatch && ntsMatch[1]?.toLowerCase().includes('byebye');
            if (isByeBye) {
              const descUrl = locationMatch[1].trim();
              for (const [key, dev] of this.devices) {
                if (dev.descriptionUrl === descUrl) {
                  this.devices.delete(key);
                  logger.info('[DLNA] Device removed by byebye: ' + dev.name);
                  break;
                }
              }
              if (this.currentCallback) this.currentCallback(this.getDevices());
              return;
            }

            const descriptionUrl = locationMatch[1].trim();
            const deviceKey = rinfo.address + '|' + descriptionUrl;
            if (!this.receivedKeys.has(deviceKey)) {
              this.receivedKeys.add(deviceKey);
              this.parseDeviceDescription(descriptionUrl, rinfo.address).then(() => {
                if (this.currentCallback) {
                  this.currentCallback(this.getDevices());
                }
              });
            }
          }
        }
      });

      socket.on('error', (err: any) => {
        logger.warn('DLNA socket error:', err);
        // 出错时尝试重建 socket
        if (this.scanning) {
          this.stopListenSocket();
          this.startListenSocket(onReady);
        }
      });

      // Cling 风格端口绑定: 尝试 1900，失败则用随机端口
      try {
        socket.bind(this.SSDP_PORT, () => {
          try {
            socket.addMembership(this.SSDP_ADDR);
            socket.setBroadcast(true);
            logger.info('UDP socket bound to port ' + this.SSDP_PORT + ' and joined multicast group');
          } catch (e: any) {
            logger.warn('Failed to join multicast:', e);
            // 不强制要求 multicast 加入，某些设备仍然可以通过广播响应
          }
          onReady();
          // 启动 backoff 重试
          this.scheduleBackoffRetry();
        });
      } catch (e) {
        logger.warn('Failed to bind to port ' + this.SSDP_PORT + ', trying random port');
        socket.bind(0, () => {
          try {
            socket.addMembership(this.SSDP_ADDR);
          } catch (e2: any) {
            logger.warn('Failed to join multicast on random port:', e2);
          }
          onReady();
          this.scheduleBackoffRetry();
        });
      }
    } catch (error) {
      logger.error('Failed to create listen socket:', error);
      // 即使 socket 失败，也尝试用纯 HTTP 描述获取（部分设备可能通过广播模式响应）
      onReady();
    }
  }

  private broadcastMSEARCH() {
    const socketClient = this.listenClient;
    if (!socketClient) return;

    // 参考 Cling: 发送多个 ST，包括 rootdevice 和 MediaRenderer
    const searchTargets = [
      'upnp:rootdevice',
      'ssdp:all',
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'urn:schemas-upnp-org:service:AVTransport:1',
      'media:all',  // 增加泛搜索
    ];

    searchTargets.forEach((st) => {
      const msg =
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + this.SSDP_ADDR + ':' + this.SSDP_PORT + '\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 3\r\n' +
        'ST: ' + st + '\r\n' +
        'USER-AGENT: Android/10.0 UPnP/1.1 Cling/2.0\r\n' +
        'CPFN.UPNP.ORG: DLNADevice\r\n' +   // 增加 FriendlyName 请求
        '\r\n';

      try {
        socketClient.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR, (err?: Error) => {
          if (err) logger.warn('M-SEARCH send error:', err);
        });
      } catch (e) {}
    });
  }

  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return;
      const xml = await response.text();

      const nameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/i);
      const friendlyName = nameMatch ? nameMatch[1] : `DLNA Device (${ip})`;

      const avMatch = xml.match(
        /<serviceType>urn:schemas-upnp-org:service:AVTransport:([12])<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i
      );
      let controlUrl = avMatch ? avMatch[2] : '';

      if (!controlUrl) {
        const anyCtrlUrl = xml.match(/<controlURL>(.*?)<\/controlURL>/i);
        if (anyCtrlUrl) controlUrl = anyCtrlUrl[1];
      }

      if (controlUrl && !controlUrl.startsWith('http')) {
        const origin = url.split('/').slice(0, 3).join('/');
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        controlUrl = controlUrl.startsWith('/') ? origin + controlUrl : baseUrl + controlUrl;
      }

      const rawPort = url.split(':')[2]?.split('/')[0];
      const port = rawPort ? parseInt(rawPort, 10) : 80;
      const id = friendlyName + '_' + ip + '_' + port;

      if (controlUrl && !this.devices.has(id)) {
        this.devices.set(id, {
          id,
          name: friendlyName,
          host: ip,
          port,
          controlUrl,
          descriptionUrl: url,
        });
        logger.info('Discovered DLNA device:', friendlyName);
      }
    } catch (error) {
      logger.debug('Failed to parse device XML:', error);
    }
  }

  private escapeXmlText(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private buildMetadata(videoUrl: string, title: string): string {
    const escapedTitle = this.escapeXmlText(title);
    const escapedUrl = this.escapeXmlText(videoUrl);
    return (
      '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
      '<item id="0" parentID="-1" restricted="1">' +
      '<dc:title>' + escapedTitle + '</dc:title>' +
      '<upnp:class>object.item.videoItem</upnp:class>' +
      '<res protocolInfo="http-get:*:video/mp4:*">' + escapedUrl + '</res>' +
      '</item>' +
      '</DIDL-Lite>'
    );
  }

  public async castVideo(device: DLNADevice, videoUrl: string, title: string) {
    logger.info('Casting to ' + device.name + ': ' + videoUrl);

    const metadata = this.buildMetadata(videoUrl, title);

    const setUriBody =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"' +
      ' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      '<s:Body>' +
      '<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">' +
      '<InstanceID>0</InstanceID>' +
      '<CurrentURI>' + this.escapeXmlText(videoUrl) + '</CurrentURI>' +
      '<CurrentURIMetaData><![CDATA[' + metadata + ']]></CurrentURIMetaData>' +
      '</u:SetAVTransportURI>' +
      '</s:Body>' +
      '</s:Envelope>';

    const playBody =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"' +
      ' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      '<s:Body>' +
      '<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">' +
      '<InstanceID>0</InstanceID>' +
      '<Speed>1</Speed>' +
      '</u:Play>' +
      '</s:Body>' +
      '</s:Envelope>';

    try {
      await this.stopCast(device).catch(() => {});

      await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"',
        },
        body: setUriBody,
      });

      await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Play"',
        },
        body: playBody,
      });

      return true;
    } catch (error) {
      logger.error('Cast failed:', error);
      throw error;
    }
  }

  public async stopCast(device: DLNADevice) {
    const stopBody =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"' +
      ' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      '<s:Body>' +
      '<u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">' +
      '<InstanceID>0</InstanceID>' +
      '</u:Stop>' +
      '</s:Body>' +
      '</s:Envelope>';

    return fetch(device.controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Stop"',
      },
      body: stopBody,
    });
  }
}

export const dlnaService = new DLNAService();
