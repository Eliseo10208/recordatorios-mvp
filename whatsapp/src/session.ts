import makeWASocket, {
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { PostgresAuthStore } from './store.js';

const baileysLogger = pino({ level: 'silent' });
const SEND_TIMEOUT_MS = 20_000;

export class WhatsAppSession {
  private socket: WASocket | null = null;
  private connected = false;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: PostgresAuthStore,
    private readonly socketFactory: typeof makeWASocket = makeWASocket,
  ) {}

  get ready(): boolean {
    return this.connected && this.socket !== null && !this.stopped;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await this.store.load();
    const socket = this.socketFactory({
      auth: state,
      logger: baileysLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.socket = socket;
    this.connected = false;
    socket.ev.on('creds.update', () => {
      this.saveQueue = this.saveQueue.then(saveCreds);
      void this.saveQueue.catch(() => {
        this.connected = false;
        socket.end(new Error('Credential persistence failed'));
        process.exit(1);
      });
    });
    socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        this.connected = true;
      } else if (connection === 'close') {
        this.connected = false;
        if (this.stopped || this.socket !== socket) return;
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) return;
        this.reconnectTimer = setTimeout(() => {
          void this.saveQueue.then(() => this.connect()).catch(() => {
            process.exit(1);
          });
        }, 3000);
      }
    });
  }

  async sendText(phone: string, message: string): Promise<string> {
    if (!this.ready || !this.socket) throw new Error('WhatsApp session is not connected');
    let timer: NodeJS.Timeout | undefined;
    try {
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Baileys send timed out')), SEND_TIMEOUT_MS);
      });
      const result = await Promise.race([
        this.socket.sendMessage(`${phone.slice(1)}@s.whatsapp.net`, { text: message }),
        timedOut,
      ]);
      if (!result?.key.id) throw new Error('Baileys did not return a message ID');
      return result.key.id;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.end(new Error('Service stopping'));
    this.socket = null;
    await this.saveQueue;
  }
}
