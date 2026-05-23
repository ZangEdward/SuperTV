import TcpSocket from 'react-native-tcp-socket';
import NetInfo from "@react-native-community/netinfo";
import { NativeModules, Platform } from 'react-native';
import Logger from '@/utils/Logger';
const { MulticastModule } = NativeModules;

console.log("[DLNA] Debug: MulticastModule =", MulticastModule);

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
 * 高兼容性 DLNA 搜索服务 (V3 稳定版)
 */
class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private searchTimeout: any = null;
  private socket: any = null;
  private searchTimers: any[] = [];
  private scanning = false;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;
  private receivedKeys: Set<string> = new Set();
  private localIp: string = '0.0.0.0';
  private broadcastAddr: string = '255.255.255.255';

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  private readonly SEARCH_INTERVALS = [0, 800, 2500, 5000, 9000, 14000];

  constructor() {}

  public getDevices(): DLNADevice[] {
    return Array.from(this.devices.values());
  }

  public async searchDevices(callback: (devices: DLNADevice[]) => void) {
    const existing = this.getDevices();
    if (existing.length > 0) callback(existing);

    if (this.scanning) this.stopSearch();

    // 计算网段广播地址 (如 192.168.1.255)
    try {
      const state = await NetInfo.fetch();
      if (state.type === 'wifi' && state.details && 'ipAddress' in state.details) {
        this.localIp = (state.details as any).ipAddress;
        const parts = this.localIp.split('.');
        if (parts.length === 4) {
          this.broadcastAddr = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
        }
      }
    } catch (e) {}

    this.scanning = true;
    this.currentCallback = callback;
    this.receivedKeys.clear();

    // 开启组播锁
    if (Platform.OS === 'android' && MulticastModule) {
      try {
        MulticastModule.acquire();
      } catch (e) {
        logger.warn('[DLNA] Lock acquire failed', e);
      }
    }

    logger.info(`[DLNA] Search Start. Local: ${this.localIp}, Broadcast: ${this.broadcastAddr}`);

    // 延迟 200ms 确保锁生效
    setTimeout(() => this.initSocket(), 200);

    this.searchTimeout = setTimeout(() => {
      if (this.scanning) {
        this.stopSearch();
        if (this.currentCallback) this.currentCallback(this.getDevices());
      }
    }, 30000);
  }

  public stopSearch() {
    this.scanning = false;
    this.currentCallback = null;
    if (this.searchTimeout) { clearTimeout(this.searchTimeout); this.searchTimeout = null; }
    this.searchTimers.forEach(t => clearTimeout(t));
    this.searchTimers = [];

    if (Platform.OS === 'android' && MulticastModule) {
      try { MulticastModule.release(); } catch (e) {}
    }

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.close();
      } catch (_) {}
      this.socket = null;
    }
  }

private initSocket() {
  try {
    if (this.socket) {
      try { this.socket.close(); } catch(e) {}
    }

    this.socket = TcpSocket.createUdpSocket('udp4');

    // 必须先加入组播
    try {
      if (this.localIp && this.localIp !== '0.0.0.0') {
        this.socket.addMembership(this.SSDP_ADDR, this.localIp);
      } else {
        this.socket.addMembership(this.SSDP_ADDR);
      }
    } catch (e) {
      logger.warn('[DLNA] addMembership error:', e);
    }

    this.socket.on('message', (msg, rinfo) => {
      console.log('[DLNA] UDP message:', msg.toString());
      const data = msg.toString();
      if (/HTTP\/1\.1 200 OK|NOTIFY|LOCATION:/i.test(data)) {
        this.handleSSDPMessage(data, rinfo.address);
      }
    });

    this.socket.on('error', (err) => {
      logger.warn('[DLNA] Socket error:', err);
    });

    // 必须绑定 1900
    this.socket.bind({ port: 1900, address: '0.0.0.0' }, () => {
      try {
        this.socket.setBroadcast(true);
        this.socket.setMulticastTTL(64);
      } catch (e) {}

      this.SEARCH_INTERVALS.forEach(delay => {
        const t = setTimeout(() => {
          if (this.scanning) this.broadcastMSEARCH();
        }, delay);
        this.searchTimers.push(t);
      });
    });

  } catch (error) {
    logger.error('[DLNA] Init failed:', error);
  }
}



  private broadcastMSEARCH() {
    if (!this.socket) return;

    const targets = [
      'upnp:rootdevice',
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'ssdp:all'
    ];

    targets.forEach(st => {
      const msg =
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 3\r\n' +
        'ST: ' + st + '\r\n' +
        'USER-AGENT: Android/11.0 UPnP/1.1 SuperTV/5.5\r\n' +
        'CPFN.UPNP.ORG: SuperTV\r\n' +
        '\r\n';

      try {
        // 组播
        this.socket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR);
        // 全域广播
        this.socket.send(msg, 0, msg.length, this.SSDP_PORT, '255.255.255.255');
        // 网段广播 (解决部分路由屏蔽 255.255.255.255 的问题)
        if (this.broadcastAddr !== '255.255.255.255') {
            this.socket.send(msg, 0, msg.length, this.SSDP_PORT, this.broadcastAddr);
        }
      } catch (e) {}
    });
  }

  private handleSSDPMessage(data: string, ip: string) {
    // 正则提取 LOCATION，不区分大小写
    const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
    if (!locationMatch || !locationMatch[1]) return;
    const descriptionUrl = locationMatch[1].trim();

    const deviceKey = ip + '|' + descriptionUrl;
    if (!this.receivedKeys.has(deviceKey)) {
      this.receivedKeys.add(deviceKey);
      this.parseDeviceDescription(descriptionUrl, ip);
    }
  }

  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) return;
      const xml = await res.text();

      const nameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/i);
      const friendlyName = nameMatch ? nameMatch[1].trim() : `DLNA Device (${ip})`;

      const avMatch = xml.match(/<serviceType>urn:schemas-upnp-org:service:AVTransport:[12]<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i);
      let controlUrl = avMatch ? avMatch[2].trim() : '';
      if (!controlUrl) {
        const anyCtrlUrl = xml.match(/<controlURL>(.*?)<\/controlURL>/i);
        if (anyCtrlUrl) controlUrl = anyCtrlUrl[1].trim();
      }
      if (!controlUrl) return;

      if (!controlUrl.startsWith('http')) {
        const origin = url.split('/').slice(0, 3).join('/');
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        controlUrl = controlUrl.startsWith('/') ? origin + controlUrl : baseUrl + controlUrl;
      }

      const portMatch = url.match(/:(\d+)\//);
      const port = portMatch ? parseInt(portMatch[1], 10) : 80;
      const id = `${friendlyName}_${ip}_${port}`;

      if (!this.devices.has(id)) {
        this.devices.set(id, { id, name: friendlyName, host: ip, port, controlUrl, descriptionUrl: url });
        logger.info(`[DLNA] Discovered: ${friendlyName} @ ${ip}`);
        if (this.currentCallback) this.currentCallback(this.getDevices());
      }
    } catch (e) {}
  }

  public async castVideo(device: DLNADevice, videoUrl: string, title: string) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const metadata = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${esc(title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:video/mp4:*">${esc(videoUrl)}</res></item></DIDL-Lite>`;
    const bodyWrap = (action: string, content: string) => `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID>${content}</u:${action}></s:Body></s:Envelope>`;

    try {
      const setUriBody = bodyWrap('SetAVTransportURI', `<CurrentURI>${esc(videoUrl)}</CurrentURI><CurrentURIMetaData><![CDATA[${metadata}]]></CurrentURIMetaData>`);
      await fetch(device.controlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"' },
        body: setUriBody,
      });
      const playBody = bodyWrap('Play', `<Speed>1</Speed>`);
      await fetch(device.controlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Play"' },
        body: playBody,
      });
      return true;
    } catch (error) {
      logger.error('[DLNA] Cast error:', error);
      throw error;
    }
  }

  public async stopCast(device: DLNADevice) {
    const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Stop></s:Body></s:Envelope>`;
    return fetch(device.controlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Stop"' },
      body: body,
    });
  }
}

export const dlnaService = new DLNAService();
