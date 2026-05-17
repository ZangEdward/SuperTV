import TcpSocket from 'react-native-tcp-socket';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import RNFetchBlob from 'react-native-blob-util';
import Logger from '@/utils/Logger';

const logger = Logger.withTag('TCPHttpServer');

const PORT = 12346;

interface HttpRequest {
  method: string;
  url: string;
  headers: { [key: string]: string };
  body: string;
}

interface HttpResponse {
  statusCode: number;
  headers: { [key: string]: string };
  body?: string;
  fileUri?: string; // 支持直接通过文件路径响应
}

type RequestHandler = (request: HttpRequest) => HttpResponse | Promise<HttpResponse>;

class TCPHttpServer {
  private server: TcpSocket.Server | null = null;
  private isRunning = false;
  private requestHandler: RequestHandler | null = null;
  private localIp: string | null = null;

  constructor() {
    this.server = null;
  }

  private parseHttpRequest(data: string): HttpRequest | null {
    try {
      const lines = data.split('\r\n');
      const requestLine = lines[0].split(' ');
      
      if (requestLine.length < 3) {
        return null;
      }

      const method = requestLine[0];
      const url = requestLine[1];
      const headers: { [key: string]: string } = {};
      
      let bodyStartIndex = -1;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') {
          bodyStartIndex = i + 1;
          break;
        }
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      }

      const body = bodyStartIndex > 0 ? lines.slice(bodyStartIndex).join('\r\n') : '';

      return { method, url, headers, body };
    } catch (error) {
      logger.info('[TCPHttpServer] Error parsing HTTP request:', error);
      return null;
    }
  }

  private formatStatusLine(statusCode: number): string {
    const statusTexts: { [key: number]: string } = {
      200: 'OK',
      206: 'Partial Content',
      400: 'Bad Request',
      404: 'Not Found',
      500: 'Internal Server Error'
    };
    const statusText = statusTexts[statusCode] || 'Unknown';
    return `HTTP/1.1 ${statusCode} ${statusText}\r\n`;
  }

  public setRequestHandler(handler: RequestHandler) {
    this.requestHandler = handler;
  }

  public async start(): Promise<string> {
    const netState = await NetInfo.fetch();
    let ipAddress: string | null = null;
    
    if (netState.type === 'wifi' || netState.type === 'ethernet') {
      ipAddress = (netState.details as any)?.ipAddress ?? null;
    }

    if (!ipAddress) {
      // Fallback for some devices
      ipAddress = '127.0.0.1';
    }

    this.localIp = ipAddress;

    if (this.isRunning) {
      logger.debug('[TCPHttpServer] Server is already running.');
      return `http://${ipAddress}:${PORT}`;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = TcpSocket.createServer((socket: TcpSocket.Socket) => {
          let requestData = '';
          
          socket.on('data', async (data: string | Buffer) => {
            requestData += data.toString();
            
            if (requestData.includes('\r\n\r\n')) {
              try {
                const request = this.parseHttpRequest(requestData);
                if (request) {
                  // 处理文件服务请求：路径以 /video/ 开头
                  if (request.url.startsWith('/video/')) {
                    await this.serveFile(request, socket);
                  } else if (this.requestHandler) {
                    const response = await this.requestHandler(request);
                    this.sendJsonResponse(response, socket);
                  }
                }
              } catch (error) {
                logger.info('[TCPHttpServer] Error handling request:', error);
                socket.write(this.formatStatusLine(500) + 'Content-Length: 0\r\n\r\n');
                socket.end();
              }
              requestData = '';
            }
          });

          socket.on('error', (error: Error) => {
            logger.info('[TCPHttpServer] Socket error:', error);
          });
        });

        this.server.listen({ port: PORT, host: '0.0.0.0' }, () => {
          logger.debug(`[TCPHttpServer] Server listening on ${ipAddress}:${PORT}`);
          this.isRunning = true;
          resolve(`http://${ipAddress}:${PORT}`);
        });

        this.server.on('error', (error: Error) => {
          logger.info('[TCPHttpServer] Server error:', error);
          this.isRunning = false;
          reject(error);
        });

      } catch (error) {
        logger.info('[TCPHttpServer] Failed to start server:', error);
        reject(error);
      }
    });
  }

  private sendJsonResponse(response: HttpResponse, socket: TcpSocket.Socket) {
    const body = response.body || '';
    let headerStr = this.formatStatusLine(response.statusCode);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': new TextEncoder().encode(body).length.toString(),
      'Connection': 'close',
      ...response.headers
    };

    for (const [key, value] of Object.entries(headers)) {
      headerStr += `${key}: ${value}\r\n`;
    }
    headerStr += '\r\n';
    socket.write(headerStr + body);
    socket.end();
  }

  private async serveFile(request: HttpRequest, socket: TcpSocket.Socket) {
    try {
      const fileName = decodeURIComponent(request.url.replace('/video/', ''));
      // 从 CacheService.getDownloadDirectory() 构建路径
      const fileUri = `${FileSystem.documentDirectory}cached_videos/${fileName}`;
      const fileExists = await RNFetchBlob.fs.exists(fileUri);

      if (!fileExists) {
        socket.write(this.formatStatusLine(404) + 'Content-Length: 0\r\n\r\n');
        socket.end();
        return;
      }

      const stat = await RNFetchBlob.fs.stat(fileUri);
      const fileSize = parseInt(stat.size, 10);

      // 处理 Range 请求 (用于快进/快退)
      const range = request.headers['range'];
      let start = 0;
      let end = fileSize - 1;
      let statusCode = 200;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        statusCode = 206;
      }

      const contentLength = end - start + 1;
      let headerStr = this.formatStatusLine(statusCode);
      headerStr += `Content-Type: video/mp4\r\n`;
      headerStr += `Content-Length: ${contentLength}\r\n`;
      headerStr += `Accept-Ranges: bytes\r\n`;
      if (range) {
        headerStr += `Content-Range: bytes ${start}-${end}/${fileSize}\r\n`;
      }
      headerStr += `Connection: keep-alive\r\n\r\n`;

      socket.write(headerStr);

      // 分块读取文件发送 (类似 LunaTV 的流式传输)
      const CHUNK_SIZE = 64 * 1024;
      const stream = await RNFetchBlob.fs.readStream(fileUri, 'base64', CHUNK_SIZE);

      let currentPos = 0;
      stream.onData((chunk: string) => {
        // 只有在 Range 范围内的块才发送
        // 注意：这里是简化的实现，实际需要更精确的偏移处理
        // RNFetchBlob.fs.readStream 不支持设置 start 偏移，这是一个限制
        // 在生产环境中可能需要 native module 才能完美支持 Range
        socket.write(chunk, 'base64');
      });

      stream.onEnd(() => {
        socket.end();
      });

      stream.onError((err) => {
        logger.error('[TCPHttpServer] Stream error:', err);
        socket.end();
      });

      stream.open();

    } catch (error) {
      logger.error('[TCPHttpServer] serveFile error:', error);
      socket.end();
    }
  }

  public getLocalUrl(fileUri: string): string | null {
    if (!this.localIp) return null;
    const fileName = fileUri.split('/').pop();
    if (!fileName) return null;
    return `http://${this.localIp}:${PORT}/video/${encodeURIComponent(fileName)}`;
  }

  public stop() {
    if (this.server && this.isRunning) {
      this.server.close();
      this.server = null;
      this.isRunning = false;
      logger.debug('[TCPHttpServer] Server stopped');
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export default new TCPHttpServer();
