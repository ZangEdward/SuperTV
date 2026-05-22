"import TcpSocket from 'react-native-tcp-socket';
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

class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private searchTimeout: any = null;
  private udpSocket: any = null;
  private searchTimers: any[] = [];
  private scanning = false;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;
  private receivedKeys: Set<string> = new Set();
  private listenPort: number = 0;
  private recvSocket: any = null;

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  private readonly SEARCH_INTERVALS = [0, 1000, 2000, 4000, 6000, 8000, 11000];
  private readonly SEARCH_TIMEOUT = 28000;

  constructor() {}

  public getDevices(): DLNADevice[] {
    return Array.from(this.devices.values());
  }

  public searchDevices(callback: (devices: DLNADevice[]) => void) {
    const existing = this.getDevices();
    if (existing.length > 0) {
      callback(existing);
    }
    if (this.scanning) this.stopSearch();
    this.scanning = true;
    this.currentCallback = callback;
    this.receivedKeys.clear();
    logger.info('[DLNA] Starting device search (single-socket)...');
    this.initSocketAndSearch();
    this.searchTimeout = setTimeout(() => {
      logger.info('[DLNA] Search finished, found ' + this.devices.size + ' devices');
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
    if (this.searchTimeout) { clearTimeout(this.searchTimeout); this.searchTimeout = null; }
    this.searchTimers.forEach(t => clearTimeout(t));
    this.searchTimers = [];
    this.closeSocket();
  }

  private closeSocket() {
    const sock = this.udpSocket || this.recvSocket;
    if (sock) {
      try { sock.removeAllListeners(); sock.close(); } catch (_) {}
    }
    this.udpSocket = null;
    this.recvSocket = null;
  }

  private initSocketAndSearch() {
    try {
      this.closeSocket();
      const socket = TcpSocket.createUdpSocket('udp4');
      this.recvSocket = socket;

      socket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        if (rinfo.address.startsWith('127.') || rinfo.address === '0.0.0.0') return;
        const data = msg.toString();
        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY * HTTP/1.1') || data.includes('NOTIFY')) {
          this.handleSSDPMessage(data, rinfo.address);
        }
      });

      socket.on('error', (err: any) => {
        logger.warn('[DLNA] Socket error:', err);
      });

      socket.bind(0, () => {
        const addr: any = socket.address();
        this.listenPort = addr?.port || 0;
        logger.info('[DLNA] Bound to port ' + this.listenPort);

        try {
          socket.addMembership(this.SSDP_ADDR);
          logger.info('[DLNA] Multicast join OK');
        } catch (e: any) {
          logger.warn('[DLNA] Multicast join failed:', e?.message || e);
        }
        try { socket.setBroadcast(true); socket.setMulticastLoopbackMode(true); socket.setMulticastTTL(4); } catch (_) {}

        this.fireMultiSearch();
        this.scheduleRepeatSearch();
      });
    } catch (error) {
      logger.error('[DLNA] Socket init error:', error);
      this.fireMultiSearch();
    }
  }

  private scheduleRepeatSearch() {
    if (!this.scanning) return;
    const timer = setTimeout(() => {
      if (!this.scanning) return;
      this.broadcastMSEARCH();
      this.scheduleRepeatSearch();
    }, 4000);
    this.searchTimers.push(timer);
  }

  private fireMultiSearch() {
    this.SEARCH_INTERVALS.forEach(delay => {
      const timer = setTimeout(() => { if (this.scanning) this.broadcastMSEARCH(); }, delay);
      this.searchTimers.push(timer);
    });
  }

  private broadcastMSEARCH() {
    if (!this.scanning) return;
    const sock = this.recvSocket;
    if (!sock) {
      this.initSocketAndSearch();
      return;
    }

    const targets = [
      'upnp:rootdevice', 'ssdp:all',
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'urn:schemas-upnp-org:device:MediaServer:1',
      'urn:schemas-upnp-org:service:AVTransport:1',
      'urn:schemas-upnp-org:service:ConnectionManager:1',
    ];

    targets.forEach(st => {
      const msg = 'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + this.SSDP_ADDR + ':' + this.SSDP_PORT + '\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 4\r\n' +
        'ST: ' + st + '\r\n' +
        'USER-AGENT: Android/10.0 UPnP/1.1 SuperTV/5.5\r\n' +
        'CPFN.UPNP.ORG: SuperTV\r\n\r\n';
      try {
        sock.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR, () => {});
      } catch (e) {}
    });

    const bcMsg = 'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 255.255.255.255:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 4\r\n' +
      'ST: upnp:rootdevice\r\n\r\n';
    try {
      sock.send(bcMsg, 0, bcMsg.length, this.SSDP_PORT, '255.255.255.255', () => {});
    } catch (e) {}
  }

  private handleSSDPMessage(data: string, ip: string) {
    const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
    if (!locationMatch || !locationMatch[1]) return;
    const descriptionUrl = locationMatch[1].trim();

    const ntsMatch = data.match(/NTS:\s*(.+?)[\r\n]/i);
    const nts = ntsMatch ? ntsMatch[1].trim().toLowerCase() : '';
    if (nts.includes('byebye')) {
      for (const [key, dev] of this.devices) {
        if (dev.descriptionUrl === descriptionUrl) {
          this.devices.delete(key);
          logger.info('[DLNA] Device left: ' + dev.name);
          break;
        }
      }
      if (this.currentCallback) this.currentCallback(this.getDevices());
      return;
    }

    const deviceKey = ip + '|' + descriptionUrl;
    if (!this.receivedKeys.has(deviceKey)) {
      this.receivedKeys.add(deviceKey);
      logger.info('[DLNA] New device: ' + ip + ' -> ' + descriptionUrl);
      this.parseDeviceDescription(descriptionUrl, ip);
    }
  }

  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return;
      const xml = await response.text();
      const nameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/i);
      const friendlyName = nameMatch ? nameMatch[1].trim() : 'Unknown (' + ip + ')';
      const avMatch = xml.match(/<serviceType>urn:schemas-upnp-org:service:AVTransport:(1|2)<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i);
      let controlUrl = avMatch ? avMatch[2].trim() : '';
      if (!controlUrl) {
        const anyCtrlUrl = xml.match(/<controlURL>(.*?)<\/controlURL>/i);
        if (anyCtrlUrl) controlUrl = anyCtrlUrl[1].trim();
      }
      if (!controlUrl) return;
      if (!controlUrl.startsWith('http')) {
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        controlUrl = controlUrl.startsWith('/') ? url.split('/').slice(0, 3).join('/') + controlUrl : baseUrl + controlUrl;
      }
      const rawPort = url.split(':')[2]?.split('/')[0];
      const port = rawPort ? parseInt(rawPort, 10) : 80;
      const id = friendlyName + '_' + ip + '_' + port;
      if (controlUrl && !this.devices.has(id)) {
        this.devices.set(id, { id, name: friendlyName, host: ip, port, controlUrl, descriptionUrl: url });
        logger.info('[DLNA] +++ Discovered: ' + friendlyName + ' at ' + ip + ':' + port);
        if (this.currentCallback) this.currentCallback(this.getDevices());
      }
    } catch (error) {
      logger.debug('[DLNA] Parse failed:', error);
    }
  }

  private escapeXmlText(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  private buildMetadata(videoUrl: string, title: string): string {
    const escapedTitle = this.escapeXmlText(title);
    const escapedUrl = this.escapeXmlText(videoUrl);
    return '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>' + escapedTitle + '</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:video/mp4:*">' + escapedUrl + '</res></item></DIDL-Lite>';
  }

  public async castVideo(device: DLNADevice, videoUrl: string, title: string) {
    logger.info('[DLNA] Casting to ' + device.name + ': ' + videoUrl);
    const metadata = this.buildMetadata(videoUrl, title);
    const setUriBody = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>' + this.escapeXmlText(videoUrl) + '</CurrentURI><CurrentURIMetaData><![CDATA[' + metadata + ']]></CurrentURIMetaData></u:SetAVTransportURI></s:Body></s:Envelope>';
    const playBody = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play></s:Body></s:Envelope>';
    try {
      await this.stopCast(device).catch(() => {});
      const setRes = await fetch(device.controlUrl, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"' }, body: setUriBody });
      if (!setRes.ok) throw new Error('SetAVTransportURI returned ' + setRes.status);
      const playRes = await fetch(device.controlUrl, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Play"' }, body: playBody });
      if (!playRes.ok) throw new Error('Play returned ' + playRes.status);
      logger.info('[DLNA] Cast successful to ' + device.name);
      return true;
    } catch (error) {
      logger.error('[DLNA] Cast failed:', error);
      throw error;
    }
  }

  public async stopCast(device: DLNADevice) {
    const stopBody = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Stop></s:Body></s:Envelope>';
    return fetch(device.controlUrl, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Stop"' }, body: stopBody });
  }
}

export const dlnaService = new DLNAService();"