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
 * 优化版 DLNA/SSDP 服务
 * 参考 Ghosten Player 优化：
 * 1. 采用单 Socket 监听模式
 * 2. 补全关键请求头 (USER-AGENT, CPFN.UPNP.ORG)
 * 3. 增加广播发现 (255.255.255.255)
 * 4. 多次间隔搜索，提高发现率
 */
class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private searchTimeout: any = null;
  private udpSocket: any = null;
  private searchTimers: any[] = [];
  private scanning = false;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;
  private receivedKeys: Set<string> = new Set();
  private listenPort: number = 0;

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  // 间隔搜索时间点
  private readonly SEARCH_INTERVALS = [0, 1000, 2500, 5000, 8000, 12000];
  private readonly SEARCH_TIMEOUT = 20000;

  constructor() {}

  public getDevices(): DLNADevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * 开始搜索设备
   */
  public searchDevices(callback: (devices: DLNADevice[]) => void) {
    const existing = this.getDevices();
    if (existing.length > 0) {
      callback(existing);
    }

    if (this.scanning) {
      this.stopSearch();
    }

    this.scanning = true;
    this.currentCallback = callback;
    this.receivedKeys.clear();

    logger.info('[DLNA] Starting device search...');

    this.initSocketAndSearch();

    this.searchTimeout = setTimeout(() => {
      logger.info(`[DLNA] Search finished, found ${this.devices.size} devices`);
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

    this.searchTimers.forEach(t => clearTimeout(t));
    this.searchTimers = [];

    this.closeSocket();
  }

  private closeSocket() {
    if (this.udpSocket) {
      try {
        this.udpSocket.removeAllListeners();
        this.udpSocket.close();
      } catch (_) {}
      this.udpSocket = null;
    }
  }

  private initSocketAndSearch() {
    try {
      this.closeSocket();
      // 使用单 Socket 模式，绑定随机端口
      this.udpSocket = TcpSocket.createUdpSocket('udp4');

      this.udpSocket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        // 忽略环回地址
        if (rinfo.address.startsWith('127.') || rinfo.address === '0.0.0.0') return;

        const data = msg.toString();
        // 响应可能是 HTTP 200 OK 或 NOTIFY
        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY')) {
          this.handleSSDPMessage(data, rinfo.address);
        }
      });

      this.udpSocket.on('error', (err: any) => {
        logger.warn('[DLNA] Socket error:', err);
      });

      this.udpSocket.bind(0, () => {
        const addr: any = this.udpSocket.address();
        this.listenPort = addr?.port || 0;
        logger.info(`[DLNA] Socket bound to port ${this.listenPort}`);

        try {
          // 加入组播组
          this.udpSocket.addMembership(this.SSDP_ADDR);
          // 设置广播和 TTL
          this.udpSocket.setBroadcast(true);
          this.udpSocket.setMulticastLoopbackMode(true);
          this.udpSocket.setMulticastTTL(4);
        } catch (e: any) {
          logger.warn('[DLNA] Failed to set multicast options:', e?.message || e);
        }

        // 立即开始多次搜索
        this.fireMultiSearch();
      });
    } catch (error) {
      logger.error('[DLNA] Failed to init socket:', error);
    }
  }

  private fireMultiSearch() {
    this.SEARCH_INTERVALS.forEach(delay => {
      const timer = setTimeout(() => {
        if (this.scanning) {
          this.broadcastMSEARCH();
        }
      }, delay);
      this.searchTimers.push(timer);
    });
  }

  private broadcastMSEARCH() {
    if (!this.udpSocket) return;

    const targets = [
      'upnp:rootdevice',
      'ssdp:all',
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'urn:schemas-upnp-org:service:AVTransport:1',
    ];

    targets.forEach(st => {
      // 补全关键请求头，增加兼容性
      const msg =
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + this.SSDP_ADDR + ':' + this.SSDP_PORT + '\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 5\r\n' +
        'ST: ' + st + '\r\n' +
        'USER-AGENT: Android/11.0 UPnP/1.1 SuperTV/5.5\r\n' +
        'CPFN.UPNP.ORG: SuperTV\r\n' +
        '\r\n';

      try {
        // 向组播地址发送
        this.udpSocket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR);
      } catch (e) {
        logger.warn(`[DLNA] Multicast send error (${st}):`, e);
      }
    });

    // 补充向广播地址发送（解决部分设备组播接收不灵敏问题）
    const bcMsg =
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 255.255.255.255:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 5\r\n' +
      'ST: upnp:rootdevice\r\n' +
      '\r\n';
    try {
      this.udpSocket.send(bcMsg, 0, bcMsg.length, this.SSDP_PORT, '255.255.255.255');
    } catch (e) {}
  }

  private handleSSDPMessage(data: string, ip: string) {
    // 匹配 LOCATION
    const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
    if (!locationMatch || !locationMatch[1]) return;

    const descriptionUrl = locationMatch[1].trim();

    // 检查是否是 ByeBye 消息（设备下线）
    const ntsMatch = data.match(/NTS:\s*(.+?)[\r\n]/i);
    const nts = ntsMatch ? ntsMatch[1].trim().toLowerCase() : '';
    if (nts.includes('byebye')) {
      this.handleDeviceOffline(descriptionUrl);
      return;
    }

    const deviceKey = ip + '|' + descriptionUrl;
    if (!this.receivedKeys.has(deviceKey)) {
      this.receivedKeys.add(deviceKey);
      this.parseDeviceDescription(descriptionUrl, ip);
    }
  }

  private handleDeviceOffline(url: string) {
    let changed = false;
    for (const [id, dev] of this.devices) {
      if (dev.descriptionUrl === url) {
        this.devices.delete(id);
        changed = true;
        break;
      }
    }
    if (changed && this.currentCallback) {
      this.currentCallback(this.getDevices());
    }
  }

  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return;
      const xml = await response.text();

      // 解析友好名称
      const nameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/i);
      const friendlyName = nameMatch ? nameMatch[1].trim() : `DLNA Device (${ip})`;

      // 解析控制 URL (优先 AVTransport)
      const avMatch = xml.match(
        /<serviceType>urn:schemas-upnp-org:service:AVTransport:([12])<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i
      );
      let controlUrl = avMatch ? avMatch[2].trim() : '';

      if (!controlUrl) {
        const anyCtrlUrl = xml.match(/<controlURL>(.*?)<\/controlURL>/i);
        if (anyCtrlUrl) controlUrl = anyCtrlUrl[1].trim();
      }

      if (!controlUrl) return;

      // 修正相对路径
      if (!controlUrl.startsWith('http')) {
        const origin = url.split('/').slice(0, 3).join('/');
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        controlUrl = controlUrl.startsWith('/') ? origin + controlUrl : baseUrl + controlUrl;
      }

      const rawPort = url.split(':')[2]?.split('/')[0];
      const port = rawPort ? parseInt(rawPort, 10) : 80;
      const id = `${friendlyName}_${ip}_${port}`;

      if (!this.devices.has(id)) {
        this.devices.set(id, {
          id,
          name: friendlyName,
          host: ip,
          port,
          controlUrl,
          descriptionUrl: url,
        });
        logger.info(`[DLNA] Found device: ${friendlyName} at ${ip}`);
        if (this.currentCallback) {
          this.currentCallback(this.getDevices());
        }
      }
    } catch (error) {
      // logger.debug('[DLNA] Failed to parse device XML:', error);
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
    logger.info(`[DLNA] Casting to ${device.name}: ${videoUrl}`);
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
      // 先停止之前的播放
      await this.stopCast(device).catch(() => {});

      const setRes = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"',
        },
        body: setUriBody,
      });
      if (!setRes.ok) throw new Error(`SetAVTransportURI failed: ${setRes.status}`);

      const playRes = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Play"',
        },
        body: playBody,
      });
      if (!playRes.ok) throw new Error(`Play failed: ${playRes.status}`);

      return true;
    } catch (error: any) {
      logger.error('[DLNA] Cast error:', error);
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
