import TcpSocket from 'react-native-tcp-socket';
import NetInfo from "@react-native-community/netinfo";
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
 * 工业级 DLNA/SSDP 发现服务
 * 修复：通过 NetInfo 获取真实 WiFi IP 并强制绑定，解决“其他 App 能搜到但本 App 搜不到”的问题。
 */
class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private searchTimeout: any = null;
  private udpSocket: any = null;
  private searchTimers: any[] = [];
  private scanning = false;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;
  private receivedKeys: Set<string> = new Set();
  private localIp: string = '0.0.0.0';

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  private readonly SEARCH_INTERVALS = [0, 800, 2000, 5000, 10000];
  private readonly SEARCH_TIMEOUT = 25000;

  constructor() {}

  public getDevices(): DLNADevice[] {
    return Array.from(this.devices.values());
  }

  public async searchDevices(callback: (devices: DLNADevice[]) => void) {
    const existing = this.getDevices();
    if (existing.length > 0) callback(existing);

    if (this.scanning) this.stopSearch();

    // 1. 关键：获取 WiFi 真实 IP
    try {
      const state = await NetInfo.fetch();
      if (state.type === 'wifi' && state.details && 'ipAddress' in state.details) {
        this.localIp = (state.details as any).ipAddress;
      } else {
        this.localIp = '0.0.0.0'; // 降级处理
      }
    } catch (e) {
      this.localIp = '0.0.0.0';
    }

    this.scanning = true;
    this.currentCallback = callback;
    this.receivedKeys.clear();

    logger.info(`[DLNA] Starting search on interface: ${this.localIp}`);
    this.initSocketAndSearch();

    this.searchTimeout = setTimeout(() => {
      this.stopSearch();
      if (this.currentCallback) this.currentCallback(this.getDevices());
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
      this.udpSocket = TcpSocket.createUdpSocket('udp4');

      this.udpSocket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        // 过滤自己发出的包
        if (rinfo.address === this.localIp) return;

        const data = msg.toString();
        // 增加容错：部分电视响应不规范，只要有 LOCATION 就算有效 SSDP 响应
        if (data.includes('LOCATION:') || data.includes('200 OK') || data.includes('NOTIFY')) {
          this.handleSSDPMessage(data, rinfo.address);
        }
      });

      this.udpSocket.on('error', (err: any) => {
        logger.warn('[DLNA] Socket Error:', err);
      });

      // 2. 关键：强制绑定到 WiFi 接口的 IP
      this.udpSocket.bind({ port: 0, address: this.localIp }, () => {
        try {
          // 3. 关键：显式指定本地 IP 作为组播接口
          this.udpSocket.addMembership(this.SSDP_ADDR, this.localIp);
          this.udpSocket.setBroadcast(true);
          this.udpSocket.setMulticastTTL(4);
        } catch (e: any) {
          logger.warn('[DLNA] Membership Error (Expected on some devices):', e?.message);
        }
        this.fireMultiSearch();
      });
    } catch (error) {
      logger.error('[DLNA] Init error:', error);
    }
  }

  private fireMultiSearch() {
    this.SEARCH_INTERVALS.forEach(delay => {
      const timer = setTimeout(() => {
        if (this.scanning) this.broadcastMSEARCH();
      }, delay);
      this.searchTimers.push(timer);
    });
  }

  private broadcastMSEARCH() {
    if (!this.udpSocket) return;

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
        '\r\n';

      try {
        this.udpSocket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR);
      } catch (e) {}
    });

    // 补充向全网广播发送
    const bcMsg =
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 255.255.255.255:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      'ST: upnp:rootdevice\r\n' +
      '\r\n';
    try {
      this.udpSocket.send(bcMsg, 0, bcMsg.length, this.SSDP_PORT, '255.255.255.255');
    } catch (e) {}
  }

  private handleSSDPMessage(data: string, ip: string) {
    const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
    if (!locationMatch || !locationMatch[1]) return;
    const descriptionUrl = locationMatch[1].trim();

    if (data.includes('ssdp:byebye')) {
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
    if (changed && this.currentCallback) this.currentCallback(this.getDevices());
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
        logger.info(`[DLNA] Found: ${friendlyName} @ ${ip}`);
        if (this.currentCallback) this.currentCallback(this.getDevices());
      }
    } catch (e) {}
  }

  public async castVideo(device: DLNADevice, videoUrl: string, title: string) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const metadata = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${esc(title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:video/mp4:*">${esc(videoUrl)}</res></item></DIDL-Lite>`;
    const bodyWrap = (action: string, content: string) => `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID>${content}</u:${action}></s:Body></s:Envelope>`;

    try {
      await this.stopCast(device).catch(() => {});
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
