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

class DLNAService {
  private devices: Map<string, DLNADevice> = new Map();
  private discoveryInterval: any = null;
  private searchTimeout: any = null;
  private client: any = null;

  constructor() {}

  public searchDevices(callback: (devices: DLNADevice[]) => void) {
    this.stopSearch();

    logger.info('Starting DLNA device search (HPlayer-inspired)...');
    this.devices.clear();

    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;

    const searchTargets = [
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'urn:schemas-upnp-org:service:AVTransport:1',
      'upnp:rootdevice',
      'ssdp:all'
    ];

    try {
      const client = TcpSocket.createUdpSocket('udp4');
      this.client = client;

      const receivedDevices = new Set<string>();

      client.on('message', async (msg: Buffer, rinfo: { address: string; port: number }) => {
        const data = msg.toString();
        if (rinfo.address.startsWith('127.') || rinfo.address === '0.0.0.0') return;

        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY * HTTP/1.1')) {
          const locationMatch = data.match(/LOCATION:\s*(.+)\r?\n/i);
          if (locationMatch && locationMatch[1]) {
            const descriptionUrl = locationMatch[1].trim();
            const deviceKey = rinfo.address + descriptionUrl;
            if (!receivedDevices.has(deviceKey)) {
              receivedDevices.add(deviceKey);
              await this.parseDeviceDescription(descriptionUrl, rinfo.address);
              callback(Array.from(this.devices.values()));
            }
          }
        }
      });

      const sendSearch = () => {
        searchTargets.forEach(st => {
          const M_SEARCH =
            'M-SEARCH * HTTP/1.1\r\n' +
            `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 3\r\n' +
            `ST: ${st}\r\n' +
            'USER-AGENT: Android/10.0 UPnP/1.1 HPlayer/1.0\r\n' +
            '\r\n';

          client.send(M_SEARCH, 0, M_SEARCH.length, SSDP_PORT, SSDP_ADDR, (err?: Error) => {
            if (err) logger.warn(`M-SEARCH error for ${st}:`, err);
          });
        });
      };

      client.bind(0, () => {
        try {
          client.addMembership(SSDP_ADDR);
        } catch (e) {}
        sendSearch();
        setTimeout(() => sendSearch(), 2000);
        setTimeout(() => sendSearch(), 5000);
      });

      this.searchTimeout = setTimeout(() => {
        this.stopSearch();
        callback(Array.from(this.devices.values()));
      }, 15000);

    } catch (error) {
      logger.error('Failed to start DLNA search:', error);
      callback([]);
    }
  }

  public stopSearch() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    if (this.client) {
      try {
        this.client.close();
      } catch (e) {}
      this.client = null;
    }
  }

  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const response = await fetch(url);
      const xml = await response.text();

      const friendlyNameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/);
      const friendlyName = friendlyNameMatch ? friendlyNameMatch[1] : `DLNA Device (${ip})`;

      const avTransportMatch = xml.match(/<serviceType>urn:schemas-upnp-org:service:AVTransport:[12]<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i);
      let controlUrl = avTransportMatch ? avTransportMatch[1] : '';

      if (!controlUrl) {
        const anyServiceMatch = xml.match(/<controlURL>(.*?)<\/controlURL>/i);
        if (anyServiceMatch) controlUrl = anyServiceMatch[1];
      }

      if (controlUrl && !controlUrl.startsWith('http')) {
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const origin = url.split('/').slice(0, 3).join('/');
        controlUrl = controlUrl.startsWith('/') ? origin + controlUrl : baseUrl + controlUrl;
      }

      const id = friendlyName + ip + (url.split(':')[2]?.split('/')[0] || '80');
      if (controlUrl) {
        this.devices.set(id, {
          id,
          name: friendlyName,
          host: ip,
          port: parseInt(url.split(':')[2]?.split('/')[0] || '80'),
          controlUrl,
          descriptionUrl: url
        });
      }
    } catch (error) {
      logger.debug('Failed to parse device XML:', error);
    }
  }

  public async castVideo(device: DLNADevice, videoUrl: string, title: string) {
    logger.info(`Casting to ${device.name}: ${videoUrl}`);
    const escapedUrl = videoUrl.replace(/&/g, '&amp;');
    const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const metadata = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">` +
      `<item id="0" parentID="-1" restricted="1">` +
        `<dc:title>${escapedTitle}</dc:title>` +
        `<upnp:class>object.item.videoItem</upnp:class>` +
        `<res protocolInfo="http-get:*:video/mp4:*">${escapedUrl}</res>` +
      `</item>` +
    `</DIDL-Lite>`;

    const escapedMetadata = metadata.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const setUriBody = `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
        `<s:Body>` +
          `<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
            `<InstanceID>0</InstanceID>` +
            `<CurrentURI>${escapedUrl}</CurrentURI>` +
            `<CurrentURIMetaData>${escapedMetadata}</CurrentURIMetaData>` +
          `</u:SetAVTransportURI>` +
        `</s:Body>` +
      `</s:Envelope>`;

    try {
      // 1. Stop current playback if any
      await this.stopCast(device).catch(() => {});

      // 2. Set URI
      await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"'
        },
        body: setUriBody
      });

      // 3. Play
      const playBody = `<?xml version="1.0" encoding="utf-8"?>` +
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
          `<s:Body>` +
            `<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
              `<InstanceID>0</InstanceID>` +
              `<Speed>1</Speed>` +
            `</u:Play>` +
          `</s:Body>` +
        `</s:Envelope>`;

      await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Play"'
        },
        body: playBody
      });

      return true;
    } catch (error) {
      logger.error('Cast failed:', error);
      throw error;
    }
  }

  public async stopCast(device: DLNADevice) {
    const stopBody = `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
        `<s:Body>` +
          `<u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
            `<InstanceID>0</InstanceID>` +
          `</u:Stop>` +
        `</s:Body>` +
      `</s:Envelope>`;

    return fetch(device.controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Stop"'
      },
      body: stopBody
    });
  }
}

export const dlnaService = new DLNAService();
