import TcpSocket from 'react-native-tcp-socket';
import NetInfo from "@react-native-community/netinfo";
import { NativeModules, Platform } from 'react-native';
import Logger from '@/utils/Logger';

const logger = Logger.withTag('DLNAService');
const { MulticastModule } = NativeModules;

export interface DLNADevice {
  id: string;
  name: string;
  host: string;
  port: number;
  controlUrl: string;
  descriptionUrl: string;
}

/**
 * 终极适配版 DLNA 发现服务
 * 修复：解决 Android 13+ 组播锁定和多网卡冲突
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

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  private readonly SEARCH_INTERVALS = [0, 500, 2000, 4500, 8000, 12000];

  constructor() {}

  public getDevices(): DLNADevice[] {
    return Array.from(this.devices.values());
  }

  public async searchDevices(callback: (devices: DLNADevice[]) => void) {
    const existing = this.getDevices();
    if (existing.length > 0) callback(existing);

    if (this.scanning) this.stopSearch();

    try {
      const state = await NetInfo.fetch();
      if (state.type === 'wifi' && state.details && 'ipAddress' in state.details) {
        this.localIp = (state.details as any).ipAddress;
      }
    } catch (e) {
      this.localIp = '0.0.0.0';
    }

    this.scanning = true;
    this.currentCallback = callback;
    this.receivedKeys.clear();

    // 开启组播锁，确保 Android 能够接收 UDP 响应包
    if (Platform.OS === 'android' && MulticastModule) {
      try {
        MulticastModule.acquire();
        logger.info('[DLNA] Multicast lock acquired');
      } catch (e) {
        logger.warn('[DLNA] Failed to acquire multicast lock:', e);
      }
    }

    logger.info(`[DLNA] Starting search. Interface: ${this.localIp}`);
    this.initSocket();

    this.searchTimeout = setTimeout(() => {
      if (this.scanning) {
        this.stopSearch();
        if (this.currentCallback) this.currentCallback(this.getDevices());
      }
    }, 25000);
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

    // 释放组播锁
    if (Platform.OS === 'android' && MulticastModule) {
      try {
        MulticastModule.release();
        logger.info('[DLNA] Multicast lock released');
      } catch (e) {}
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
      this.socket = TcpSocket.createUdpSocket('udp4');

      this.socket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        if (rinfo.address === this.localIp) return;
        const data = msg.toString();
        // 标准/非标准报文过滤
        if (data.includes('LOCATION:') || data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY')) {
          this.handleSSDPMessage(data, rinfo.address);
        }
      });

      this.socket.on('error', (err: any) => {
        logger.warn('[DLNA] Socket error:', err);
      });

      // 关键：绑定 0.0.0.0 以接收所有回包
      this.socket.bind({ port: 0, address: '0.0.0.0' }, () => {
        try {
          this.socket.setBroadcast(true);
          this.socket.setMulticastTTL(4);
          this.socket.setMulticastLoopbackMode(true);
          if (this.localIp && this.localIp !== '0.0.0.0') {
            this.socket.addMembership(this.SSDP_ADDR, this.localIp);
          } else {
            this.socket.addMembership(this.SSDP_ADDR);
          }
        } catch (e: any) {
          logger.warn('[DLNA] Multicast bind warning:', e?.message);
        }

        // 立即触发密集搜索
        this.SEARCH_INTERVALS.forEach(delay => {
          const t = setTimeout(() => {
            if (this.scanning) this.broadcastMSEARCH();
          }, delay);
          this.searchTimers.push(t);
        });
      });
    } catch (error) {
      logger.error('[DLNA] Init error:', error);
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
      // 对齐乐播等 App 的标准 SSDP 报文格式
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
        this.socket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR);
        this.socket.send(msg, 0, msg.length, this.SSDP_PORT, '255.255.255.255');
      } catch (e) {}
    });
  }

  private handleSSDPMessage(data: string, ip: string) {
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
        logger.info(`[DLNA] Found Device: ${friendlyName} @ ${ip}`);
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
