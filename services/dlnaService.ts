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

  /**
   * 搜索局域网内的 DLNA 设备 (SSDP)
   * 增强版：使用多轮广播 + 更长等待时间 + 本地 lo 地址过滤
   */
  public searchDevices(callback: (devices: DLNADevice[]) => void) {
    // 先清理之前的搜索
    this.stopSearch();

    logger.info('Starting DLNA device search (enhanced)...');
    this.devices.clear();

    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;

    // 搜索多个目标以提高兼容性
    const searchTargets = [
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'upnp:rootdevice',
      'ssdp:all'
    ];

    try {
      const client = TcpSocket.createUdpSocket('udp4');
      this.client = client;

      const receivedDevices = new Set<string>();

      client.on('message', async (msg: Buffer, rinfo: { address: string; port: number }) => {
        const data = msg.toString();
        // 跳过本地回环和一些无效地址
        if (rinfo.address.startsWith('127.') || rinfo.address === '0.0.0.0') return;

        logger.debug(`SSDP from ${rinfo.address}:${rinfo.port}`);

        if (data.includes('HTTP/1.1 200 OK') || data.includes('NOTIFY * HTTP/1.1')) {
          const locationMatch = data.match(/LOCATION:\s*(.+)\r?\n/i);
          if (locationMatch && locationMatch[1]) {
            const descriptionUrl = locationMatch[1].trim();
            const deviceKey = rinfo.address + descriptionUrl.substring(0, 50);
            if (!receivedDevices.has(deviceKey)) {
              receivedDevices.add(deviceKey);
              await this.parseDeviceDescription(descriptionUrl, rinfo.address);
              callback(Array.from(this.devices.values()));
            }
          }
        }
      });

      client.on('error', (err: Error) => {
        logger.error('UDP Socket error:', err);
      });

      const sendSearch = () => {
        searchTargets.forEach(st => {
          const M_SEARCH =
            'M-SEARCH * HTTP/1.1\r\n' +
            `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 5\r\n' +
            `ST: ${st}\r\n` +
            'USER-AGENT: SuperTV/2.0 UPnP/1.1 DLNADOC/1.50\r\n' +
            '\r\n';

          client.send(M_SEARCH, 0, M_SEARCH.length, SSDP_PORT, SSDP_ADDR, (err?: Error) => {
            if (err) logger.warn(`M-SEARCH send error for ${st}:`, err);
          });
        });
      };

      client.bind(0, () => {
        // 加入多播组
        try {
          client.addMembership(SSDP_ADDR);
        } catch (e) {
          logger.warn('Failed to add multicast membership:', e);
        }

        logger.info('SSDP socket bound, sending initial M-SEARCH...');
        // 首次发送
        sendSearch();

        // 延迟再次发送以捕获更多设备
        setTimeout(() => sendSearch(), 1500);
      });

      // 15 秒后停止搜索
      this.searchTimeout = setTimeout(() => {
        logger.info('DLNA search finished.');
        this.stopSearch();
        // 最终回调确保 UI 更新
        callback(Array.from(this.devices.values()));
      }, 15000);

    } catch (error) {
      logger.error('Failed to start DLNA search:', error);
      callback([]);
    }
  }

  /** 停止当前搜索 */
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

  /**
   * 解析设备描述文件 (XML)
   */
  private async parseDeviceDescription(url: string, ip: string) {
    try {
      const response = await fetch(url);
      const xml = await response.text();

      const friendlyNameMatch = xml.match(/<friendlyName>(.*?)<\/friendlyName>/);
      const friendlyName = friendlyNameMatch ? friendlyNameMatch[1] : `未知设备 (${ip})`;

      // 查找 AVTransport 控制链接 - 增强匹配逻辑，兼容更多厂商（参考 VlcDlnaPlayer/Cling 逻辑）
      const avTransportMatch = xml.match(/<serviceType>urn:schemas-upnp-org:service:AVTransport:[12]<\/serviceType>[\s\S]*?<controlURL>(.*?)<\/controlURL>/i);
      let controlUrl = avTransportMatch ? avTransportMatch[1] : '';

      // 如果没有 AVTransport，尝试搜索简单的播放控制服务
      if (!controlUrl) {
        const anyServiceMatch = xml.match(/<controlURL>(.*?)<\/controlURL>/i);
        if (anyServiceMatch) controlUrl = anyServiceMatch[1];
      }

      if (controlUrl && !controlUrl.startsWith('http')) {
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const origin = url.split('/').slice(0, 3).join('/');

        if (controlUrl.startsWith('/')) {
          controlUrl = origin + controlUrl;
        } else {
          controlUrl = baseUrl + controlUrl;
        }
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

    // 格式化 metadata (DIDL-Lite)，确保更多播放器能识别 (参考 VlcDlnaPlayer)
    const escapedUrl = videoUrl.replace(/&/g, '&amp;');
    const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const metadata = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">` +
      `<item id="0" parentID="-1" restricted="1">` +
        `<dc:title>${escapedTitle}</dc:title>` +
        `<upnp:class>object.item.videoItem</upnp:class>` +
        `<res protocolInfo="http-get:*:video/*:DLNA.ORG_PN=MP4;DLNA.ORG_OP=01;DLNA.ORG_CI=0">${escapedUrl}</res>` +
      `</item>` +
    `</DIDL-Lite>`;

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
        `<s:Body>` +
          `<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
            `<InstanceID>0</InstanceID>` +
            `<CurrentURI>${escapedUrl}</CurrentURI>` +
            `<CurrentURIMetaData>${metadata.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}</CurrentURIMetaData>` +
          `</u:SetAVTransportURI>` +
        `</s:Body>` +
      `</s:Envelope>`;

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
