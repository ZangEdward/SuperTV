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

  constructor() {}

  /**
   * 搜索局域网内的 DLNA 设备 (SSDP)
   */
  public searchDevices(callback: (devices: DLNADevice[]) => void) {
    logger.debug('Starting DLNA device search...');

    // SSDP 组播地址和端口
    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;

    // M-SEARCH 请求包
    const M_SEARCH =
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      'ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n' +
      '\r\n';

    try {
      // 创建 UDP Socket 进行搜索
      const client = TcpSocket.createUdpSocket('udp4');

      client.on('message', async (msg, rinfo) => {
        const data = msg.toString();
        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY * HTTP/1.1')) {
          const locationMatch = data.match(/LOCATION: (.+)\r\n/i);
          if (locationMatch && locationMatch[1]) {
            const descriptionUrl = locationMatch[1].trim();
            await this.parseDeviceDescription(descriptionUrl, rinfo.address);
            callback(Array.from(this.devices.values()));
          }
        }
      });

      client.on('error', (err) => {
        logger.error('UDP Socket error:', err);
      });

      client.bind(0, () => {
        client.send(M_SEARCH, 0, M_SEARCH.length, SSDP_PORT, SSDP_ADDR, (err) => {
          if (err) logger.error('Failed to send M-SEARCH:', err);
        });
      });

      // 5秒后关闭搜索
      setTimeout(() => {
        client.close();
        logger.debug('DLNA search stopped.');
      }, 5000);

    } catch (error) {
      logger.error('Failed to start DLNA search:', error);
    }
  }

  /**
   * 解析设备描述文件 (XML)
   */
  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const response = await fetch(url);
      const xml = await response.text();

      const friendlyNameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/);
      const friendlyName = friendlyNameMatch ? friendlyNameMatch[1] : `未知设备 (${ip})`;

      // 查找 AVTransport 控制链接
      // 简单的正则解析，实际可能需要更复杂的 XML 处理
      const serviceMatch = xml.match(/<serviceType>urn:schemas-upnp-org:service:AVTransport:1<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/);
      let controlUrl = serviceMatch ? serviceMatch[1] : '';

      if (controlUrl && !controlUrl.startsWith('http')) {
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const origin = url.split('/').slice(0, 3).join('/');
        controlUrl = controlUrl.startsWith('/') ? origin + controlUrl : baseUrl + controlUrl;
      }

      const id = friendlyName + ip;
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
      logger.info('Failed to parse device description:', error);
    }
  }

  /**
   * 发送视频 URL 到指定设备进行播放
   */
  public async castVideo(device: DLNADevice, videoUrl: string, title: string) {
    logger.info(`Casting to ${device.name}: ${videoUrl}`);

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>
          <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
            <InstanceID>0</InstanceID>
            <CurrentURI>${videoUrl.replace(/&/g, '&amp;')}</CurrentURI>
            <CurrentURIMetaData><![CDATA[<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/"><item id="0" parentID="-1" restricted="1"><dc:title>${title}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:video/*:DLNA.ORG_PN=MP4;DLNA.ORG_OP=01;DLNA.ORG_CI=0">${videoUrl.replace(/&/g, '&amp;')}</res></item></DIDL-Lite>]]></CurrentURIMetaData>
          </u:SetAVTransportURI>
        </s:Body>
      </s:Envelope>`;

    try {
      // 1. 设置播放 URI
      const setUriRes = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"'
        },
        body: soapBody
      });

      if (!setUriRes.ok) throw new Error('SetAVTransportURI failed');

      // 2. 发送 Play 指令
      const playSoap = `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
            <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
              <InstanceID>0</InstanceID>
              <Speed>1</Speed>
            </u:Play>
          </s:Body>
        </s:Envelope>`;

      await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#Play"'
        },
        body: playSoap
      });

      return true;
    } catch (error) {
      logger.error('Cast failed:', error);
      throw error;
    }
  }
}

export const dlnaService = new DLNAService();
