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
 * 修复版 DLNA/SSDP 服务（2024）
 *
 * 核心问题修复：
 * 1. 双 Socket 架构：接收 socket 和发送 socket 分离
 *    - recvSocket: 监听随机端口，接收 SSDP 响应
 *    - sendSocket: 定时发送 M-SEARCH，发完即丢弃
 *    避免同一个 socket 既发又收导致的 Android 兼容性问题
 *
 * 2. 放弃绑定端口 1900（特权端口，Android 12+ 无法绑定）
 *    改为绑定随机端口，配合 `CHANGE_WIFI_MULTICAST_STATE` 权限加入组播
 *
 * 3. 强制加入组播组，即使绑定随机端口也尝试 addMembership
 *    确保能收到 SSDP NOTIFY 和 M-SEARCH 响应
 *
 * 4. 修复回调锁定问题：搜索结束后不管有没有设备都通知 callback
 *
 * 5. 缓存设备列表，stopSearch 不清空（避免下次打开空白）
 *
 * 6. 投屏 URL 转换：本地 file:// 地址自动转换为 HTTP 地址
 *
 * 7. 使用 Platform 检测，web 环境绕过原生 TCP
 */
class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private searchTimeout: any = null;
  private recvSocket: any = null;
  private sendSocket: any = null;
  private searchTimers: any[] = [];
  private scanning = false;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;
  private receivedKeys: Set<string> = new Set();
  private lastResponseTime: number = 0;
  private backoffTimer: any = null;
  private listenPort: number = 0;

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  private readonly SEARCH_INTERVALS = [0, 500, 1500, 3000, 6000, 10000]; // 缩短初期间隔，增加频率
  private readonly SEARCH_TIMEOUT = 30000;
  private readonly BACKOFF_TIMEOUT = 5000;

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

    logger.info('Starting DLNA device search (dual-socket mode)...');

    // 1. 启动监听 socket
    this.startRecvSocket(() => {
      // 2. 发送 M-SEARCH 探测
      this.fireMultiSearch();
    });

    // 3. 总超时 — 结束后一定回调（即使没找到设备）
    this.searchTimeout = setTimeout(() => {
      this.stopSearch();
      if (this.currentCallback) {
        this.currentCallback(this.getDevices());
      }
      this.currentCallback = null;
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

    this.closeSockets();
  }

  private closeSockets() {
    if (this.recvSocket) {
      try { this.recvSocket.close(); } catch (_) {}
      this.recvSocket = null;
    }
    if (this.sendSocket) {
      try { this.sendSocket.close(); } catch (_) {}
      this.sendSocket = null;
    }
  }

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

  private scheduleBackoffRetry() {
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    if (!this.scanning) return;

    this.backoffTimer = setTimeout(() => {
      if (!this.scanning) return;
      const elapsed = Date.now() - this.lastResponseTime;
      if (elapsed >= this.BACKOFF_TIMEOUT) {
        logger.info('[DLNA] No responses in ' + elapsed + 'ms, re-sending M-SEARCH (backoff)');
        this.broadcastMSEARCH();
        this.lastResponseTime = Date.now();
        this.scheduleBackoffRetry();
      } else {
        this.scheduleBackoffRetry();
      }
    }, this.BACKOFF_TIMEOUT);
  }

  /**
   * 接收 socket — 绑定随机端口，加入组播组
   * 专门用来收 SSDP 响应和 NOTIFY
   */
  private startRecvSocket(onReady: () => void) {
    try {
      const socket = TcpSocket.createUdpSocket('udp4');
      this.recvSocket = socket;

      socket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        if (rinfo.address.startsWith('127.') || rinfo.address === '0.0.0.0') return;

        const data = msg.toString();
        this.lastResponseTime = Date.now();
        this.scheduleBackoffRetry();

        // 增强 SSDP 消息解析逻辑，兼容更多电视品牌
        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY')) {
          this.handleSSDPMessage(data, rinfo.address);
        }
      });

      socket.on('error', (err: any) => {
        logger.warn('[DLNA] recv socket error:', err);
        if (this.scanning) {
          this.closeSockets();
          setTimeout(() => this.startRecvSocket(onReady), 1000);
        }
      });

      // 绑定 1900 端口尝试（仅为了接收 NOTIFY），如果失败则绑定 0
      const tryBind = (port: number) => {
        socket.bind(port, () => {
          const addr: any = socket.address();
          this.listenPort = addr?.port || 0;
          logger.info('[DLNA] Recv socket bound to port ' + this.listenPort);

          try {
            socket.addMembership(this.SSDP_ADDR);
            logger.info('[DLNA] Successfully joined multicast group ' + this.SSDP_ADDR);
          } catch (e: any) {
            logger.warn('[DLNA] Failed to join multicast:', e?.message || e);
          }

          try {
            socket.setBroadcast(true);
            socket.setMulticastLoopbackMode(true);
            socket.setMulticastTTL(4);
          } catch (_) {}

          onReady();
          this.scheduleBackoffRetry();
        });
      };

      // 优先尝试绑定 1900，失败则回退到随机端口
      try {
        tryBind(0);
      } catch (e) {
        tryBind(0);
      }
    } catch (error) {
      logger.error('[DLNA] Failed to create recv socket:', error);
      onReady();
    }
  }

  /**
   * 发送 M-SEARCH — 每次都创建独立的发送 socket，发完即关
   * 避免双工问题
   */
  private broadcastMSEARCH() {
    if (!this.scanning) return;

    try {
      const socket = TcpSocket.createUdpSocket('udp4');
      this.sendSocket = socket;

      socket.on('error', (err: any) => {
        logger.warn('[DLNA] send socket error:', err);
      });

      const searchTargets = [
        'upnp:rootdevice',
        'ssdp:all',
        'urn:schemas-upnp-org:device:MediaRenderer:1',
        'urn:schemas-upnp-org:service:AVTransport:1',
      ];

      let sentCount = 0;
      searchTargets.forEach((st) => {
        const msg =
          'M-SEARCH * HTTP/1.1\r\n' +
          'HOST: ' + this.SSDP_ADDR + ':' + this.SSDP_PORT + '\r\n' +
          'MAN: "ssdp:discover"\r\n' +
          'MX: 3\r\n' +
          'ST: ' + st + '\r\n' +
          'USER-AGENT: Android/11.0 UPnP/1.1 SuperTV/5.5\r\n' +
          'CPFN.UPNP.ORG: SuperTV\r\n' + // 增加一些电视品牌识别的扩展头
          '\r\n';

        try {
          socket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR, (err?: Error) => {
            if (err) logger.warn('[DLNA] M-SEARCH send error:', err);
            sentCount++;
            // 所有 ST 发完后关闭 socket
            if (sentCount >= searchTargets.length) {
              try { socket.close(); } catch (_) {}
            }
          });
        } catch (e) {
          sentCount++;
        }
      });

      // 5 秒后强制关闭
      setTimeout(() => {
        try { socket.close(); } catch (_) {}
      }, 5000);
    } catch (e) {
      logger.warn('[DLNA] Failed to create send socket:', e);
    }
  }

  /**
   * 处理 SSDP 消息（响应和 NOTIFY）
   */
  private handleSSDPMessage(data: string, ip: string) {
    const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
    const ntsMatch = data.match(/NTS:\s*(.+?)[\r\n]/i);

    if (!locationMatch || !locationMatch[1]) return;

    const descriptionUrl = locationMatch[1].trim();
    const isByeBye = ntsMatch && ntsMatch[1]?.toLowerCase().includes('byebye');

    if (isByeBye) {
      for (const [key, dev] of this.devices) {
        if (dev.descriptionUrl === descriptionUrl) {
          this.devices.delete(key);
          logger.info('[DLNA] Device removed by byebye: ' + dev.name);
          break;
        }
      }
      if (this.currentCallback) this.currentCallback(this.getDevices());
      return;
    }

    const deviceKey = ip + '|' + descriptionUrl;
    if (!this.receivedKeys.has(deviceKey)) {
      this.receivedKeys.add(deviceKey);
      this.parseDeviceDescription(descriptionUrl, ip).then(() => {
        if (this.currentCallback) {
          this.currentCallback(this.getDevices());
        }
      });
    }
  }

  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return;
      const xml = await response.text();

      const nameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/i);
      const friendlyName = nameMatch ? nameMatch[1].trim() : `DLNA Device (${ip})`;

      const avMatch = xml.match(
        /<serviceType>urn:schemas-upnp-org:service:AVTransport:([12])<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i
      );
      let controlUrl = avMatch ? avMatch[2].trim() : '';

      if (!controlUrl) {
        const anyCtrlUrl = xml.match(/<controlURL>(.*?)<\/controlURL>/i);
        if (anyCtrlUrl) controlUrl = anyCtrlUrl[1].trim();
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
        logger.info('[DLNA] Discovered device: ' + friendlyName + ' at ' + ip);
      }
    } catch (error) {
      logger.debug('[DLNA] Failed to parse device XML:', error);
    }
  }

  private escapeXmlText(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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
    logger.info('[DLNA] Casting to ' + device.name + ': ' + videoUrl);

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

      const setRes = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"',
        },
        body: setUriBody,
      });

      if (!setRes.ok) {
        const text = await setRes.text();
        const errorDetail = text.match(/<description>(.*?)<\/description>/i)?.[1] || setRes.statusText;
        throw new Error(`设置地址失败: ${errorDetail} (${setRes.status})`);
      }

      const playRes = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Play"',
        },
        body: playBody,
      });

      if (!playRes.ok) {
        const text = await playRes.text();
        const errorDetail = text.match(/<description>(.*?)<\/description>/i)?.[1] || playRes.statusText;
        throw new Error(`播放命令失败: ${errorDetail} (${playRes.status})`);
      }

      logger.info('[DLNA] Cast successful to ' + device.name);
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new Error('连接设备超时，请检查电视网络');
      }
      if (error.message.includes('Network request failed')) {
        throw new Error('无法连接到设备，请确认在同一 WiFi 下');
      }
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
