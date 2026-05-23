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
 * 修复：合并发送和接收 Socket，确保能收到单播响应。
 */
class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private searchTimeout: any = null;
  private socket: any = null;
  private scanning = false;
  private currentCallback: ((devices: DLNADevice[]) => void) | null = null;
  private receivedKeys: Set<string> = new Set();
  private lastResponseTime: number = 0;

  private readonly SSDP_ADDR = '239.255.255.250';
  private readonly SSDP_PORT = 1900;
  private readonly SEARCH_TIMEOUT = 15000;

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

    logger.info('Starting DLNA device search (Single-socket mode)...');

    this.startSocket(() => {
      this.broadcastMSEARCH();
    });

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

    this.closeSocket();
  }

  private closeSocket() {
    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
      this.socket = null;
    }
  }

  private startSocket(onReady: () => void) {
    try {
      this.socket = TcpSocket.createUdpSocket('udp4');

      this.socket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        const data = msg.toString();
        // logger.debug(`[DLNA] Received message from ${rinfo.address}: ${data.substring(0, 100)}`);

        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY')) {
          this.handleSSDPMessage(data, rinfo.address);
        }
      });

      this.socket.on('error', (err: any) => {
        logger.warn('[DLNA] socket error:', err);
      });

      this.socket.bind(0, () => {
        const addr: any = this.socket.address();
        logger.info('[DLNA] Socket bound to port ' + addr?.port);

        try {
          this.socket.addMembership(this.SSDP_ADDR);
          this.socket.setBroadcast(true);
        } catch (e: any) {
          logger.warn('[DLNA] Failed to join multicast or set broadcast:', e?.message || e);
        }

        onReady();
      });
    } catch (error) {
      logger.error('[DLNA] Failed to create socket:', error);
      onReady();
    }
  }

  private broadcastMSEARCH() {
    if (!this.socket) return;

    const searchTargets = [
      'upnp:rootdevice',
      'ssdp:all',
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'urn:schemas-upnp-org:service:AVTransport:1',
    ];

    searchTargets.forEach((st) => {
      const msg =
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + this.SSDP_ADDR + ':' + this.SSDP_PORT + '\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 3\r\n' +
        'ST: ' + st + '\r\n' +
        'USER-AGENT: Android/11.0 UPnP/1.1 SuperTV/5.5\r\n' +
        'CPFN.UPNP.ORG: SuperTV\r\n' +
        '\r\n';

      try {
        this.socket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR);
      } catch (e) {
        logger.warn('[DLNA] M-SEARCH send error:', e);
      }
    });

    // 间隔 1s 再发一次，增加发现概率
    if (this.scanning) {
      setTimeout(() => {
        if (this.scanning) this.broadcastMSEARCH_secondary();
      }, 1000);
    }
  }

  private broadcastMSEARCH_secondary() {
    if (!this.socket) return;
    const msg =
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + this.SSDP_ADDR + ':' + this.SSDP_PORT + '\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 3\r\n' +
        'ST: ssdp:all\r\n' +
        '\r\n';
    try {
      this.socket.send(msg, 0, msg.length, this.SSDP_PORT, this.SSDP_ADDR);
    } catch (e) {}
  }

  private handleSSDPMessage(data: string, ip: string) {
    const locationMatch = data.match(/LOCATION:\s*(.+?)[\r\n]/i);
    if (!locationMatch || !locationMatch[1]) return;

    const descriptionUrl = locationMatch[1].trim();
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
      const response = await fetch(url);
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
    } catch (error: any) {
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
