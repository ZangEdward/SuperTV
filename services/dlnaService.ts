import TcpSocket from 'react-native-tcp-socket';
import NetInfo from "@react-native-community/netinfo";
import { NativeModules, Platform } from 'react-native';
import Logger from '@/utils/Logger';
import dgram from 'react-native-udp';
const { MulticastModule } = NativeModules;

const logger = Logger.withTag('DLNAService');

export interface DLNADevice {
  id: string;
  name: string;
  host: string;
  port: number;
  controlUrl: string;
  descriptionUrl: string;
}

class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private receivedKeys: Set<string> = new Set();
  private scanning = false;
  private socket: any = null;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  private readonly SEARCH_INTERVALS = [0, 800, 2500, 5000, 9000, 14000];

  constructor() {}

  // -------------------------
  // 设备管理
  // -------------------------
  public getDevices(): DLNADevice[] {
    return Array.from(this.devices.values());
  }

  public clearDevices() {
    this.devices.clear();
  }

  // -------------------------
  // 搜索入口
  // -------------------------
  public async searchDevices(callback: (devices: DLNADevice[]) => void) {
    this.scanning = true;
    this.currentCallback = callback;
    this.receivedKeys.clear();
    this.clearDevices();

    await this.initSocket();

    // 多次发送 M-SEARCH
    this.SEARCH_INTERVALS.forEach(delay => {
      setTimeout(() => {
        if (this.scanning) this.broadcastMSEARCH();
      }, delay);
    });
  }

  public stopSearch() {
    this.scanning = false;
    this.currentCallback = null;

    if (Platform.OS === 'android' && MulticastModule) {
      try { MulticastModule.release(); } catch (_) {}
    }

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.close();
      } catch (_) {}
      this.socket = null;
    }
  }

  // -------------------------
  // 初始化 socket
  // -------------------------
  private async initSocket() {
    try {
      if (this.socket) {
        try { this.socket.close(); } catch (_) {}
      }

      const state = await NetInfo.fetch();
      const localIp = state.details?.ipAddress || "0.0.0.0";

      if (Platform.OS === 'android' && MulticastModule) {
        try { MulticastModule.acquire(); } catch (_) {}
      }

      this.socket = dgram.createSocket('udp4');

      this.socket.on('message', (msg, rinfo) => {
        this.handleSSDPMessage(msg.toString(), rinfo.address);
      });

      this.socket.on('error', (err) => {
        console.log('[DLNA] UDP error:', err);
      });

      this.socket.bind(1900, localIp, () => {
        this.socket.setBroadcast(true);
        this.socket.setMulticastTTL(64);

        try {
          this.socket.addMembership(this.SSDP_ADDR, localIp);
        } catch (e) {
          console.log('[DLNA] addMembership error:', e);
        }
      });

    } catch (e) {
      console.log('[DLNA] Init failed:', e);
    }
  }

  // -------------------------
  // 发送 M-SEARCH
  // -------------------------
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
        '\r\n';

      try {
        this.socket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR);
      } catch (_) {}
    });
  }

  // -------------------------
  // 处理 SSDP 消息
  // -------------------------
  private handleSSDPMessage(data: string, ip: string) {
    const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
    if (!locationMatch) return;

    const descriptionUrl = locationMatch[1].trim();
    const key = descriptionUrl;

    if (!this.receivedKeys.has(key)) {
      this.receivedKeys.add(key);
      this.parseDeviceDescription(descriptionUrl, ip);
    }
  }

  // -------------------------
  // 解析设备描述
  // -------------------------
  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) return;

      const xml = await res.text();

      const nameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/i);
      const friendlyName = nameMatch ? nameMatch[1].trim() : `DLNA Device (${ip})`;

      const avMatch = xml.match(/<serviceType>urn:schemas-upnp-org:service:AVTransport:[12]<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i);
      let controlUrl = avMatch ? avMatch[1].trim() : '';

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
        if (this.currentCallback) this.currentCallback(this.getDevices());
      }
    } catch (_) {}
  }

  // -------------------------
  // 投屏
  // -------------------------
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

  // -------------------------
  // 停止投屏
  // -------------------------
  public async stopCast(device: DLNADevice) {
    const bodyWrap = (action: string, content: string) => `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID>${content}</u:${action}></s:Body></s:Envelope>`;

    try {
      const stopBody = bodyWrap('Stop', '');
      await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Stop"'
        },
        body: stopBody,
      });
      return true;
    } catch (error) {
      logger.error('[DLNA] Stop error:', error);
      throw error;
    }
  }
}

export const dlnaService = new DLNAService();
