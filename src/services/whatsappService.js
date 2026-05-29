const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const PrismaStore = require('./PrismaStore');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class WhatsAppService {
    constructor() {
        this.client = null;
        this.qrDataURL = null;
        this.status = 'DISCONNECTED';
        this.lastError = null;
        this.messageQueue = [];
        this.isProcessingQueue = false;
    }

    async initialize(retries = 3) {
        console.log('Initializing WhatsApp Service...');
        this.status = 'INITIALIZING';
        try {
            if (!this.client) {
                let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
                
                // If running on Render, use sparticuz chromium to bypass memory/download issues
                if (process.env.RENDER) {
                    console.log('Running on Render: using @sparticuz/chromium');
                    const chromium = require('@sparticuz/chromium');
                    executablePath = await chromium.executablePath();
                }

                const store = new PrismaStore(prisma);

                this.client = new Client({
                    authStrategy: new RemoteAuth({
                        clientId: 'mmwo-bot',
                        store: store,
                        backupSyncIntervalMs: 60000 // Backup session every 1 minute
                    }),
                    puppeteer: {
                        headless: true,
                        executablePath: executablePath,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--no-first-run',
                            '--no-zygote',
                            '--disable-gpu',
                            '--js-flags="--max-old-space-size=256"',
                            '--disable-extensions',
                            '--mute-audio'
                        ]
                    },
                    webVersionCache: {
                        type: 'remote',
                        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
                        strict: false
                    }
                });

                this.client.on('qr', async (qr) => {
                    console.log('WhatsApp QR Code received. Awaiting scan...');
                    this.status = 'AWAITING_SCAN';
                    try {
                        this.qrDataURL = await qrcode.toDataURL(qr);
                    } catch (err) {
                        console.error('Failed to generate QR data URL', err);
                    }
                });

                this.client.on('ready', () => {
                    console.log('WhatsApp Client is ready!');
                    this.status = 'CONNECTED';
                    this.qrDataURL = null; // Clear QR code once connected
                });

                this.client.on('remote_session_saved', () => {
                    console.log('WhatsApp Remote Session successfully saved to Database!');
                });

                this.client.on('authenticated', () => {
                    console.log('WhatsApp Client Authenticated');
                });

                this.client.on('auth_failure', msg => {
                    console.error('WhatsApp Auth failure', msg);
                    this.status = 'AUTH_FAILURE';
                });

                this.client.on('disconnected', (reason) => {
                    console.log('WhatsApp Client was disconnected', reason);
                    this.status = 'DISCONNECTED';
                    // Attempt to reconnect after a delay
                    setTimeout(() => this.initialize(), 5000);
                });
            }

            await this.client.initialize();
            this.lastError = null;
        } catch (err) {
            console.error('Failed to initialize WhatsApp client:', err.message);
            this.lastError = err.message;
            if (retries > 0) {
                console.log(`Retrying initialization in 5 seconds... (${retries} attempts left)`);
                setTimeout(() => this.initialize(retries - 1), 5000);
            } else {
                this.status = 'FAILED';
            }
        }
    }

    getStatus() {
        return {
            status: this.status,
            qr: this.qrDataURL,
            error: this.lastError
        };
    }

    async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const { to, message, resolve } = this.messageQueue.shift();

            if (this.status !== 'CONNECTED') {
                console.warn('Cannot send WhatsApp message: Client is not connected.');
                resolve(false);
                continue;
            }

            try {
                let formattedNumber = to.replace(/\D/g, '');
                if (formattedNumber.startsWith('0')) {
                    formattedNumber = '62' + formattedNumber.substring(1);
                }
                const chatId = `${formattedNumber}@c.us`;
                await this.client.sendMessage(chatId, message);
                resolve(true);
            } catch (error) {
                console.error(`Failed to send WhatsApp message to ${to}:`, error);
                resolve(false);
            }

            // Delay between messages to prevent rate limit (1.5 seconds)
            await new Promise(res => setTimeout(res, 1500));
        }

        this.isProcessingQueue = false;
    }

    /**
     * Send a WhatsApp message
     * @param {string} to - The phone number (e.g., '628123456789')
     * @param {string} message - The text message
     */
    async sendMessage(to, message) {
        return new Promise((resolve) => {
            this.messageQueue.push({ to, message, resolve });
            this.processQueue();
        });
    }

    async logout() {
        try {
            if (this.client) {
                await this.client.logout();
                this.status = 'DISCONNECTED';
                this.qrDataURL = null;
                // Delete session from DB
                await prisma.whatsAppSession.deleteMany({});
                
                // Reinitialize to get new QR
                setTimeout(() => this.initialize(), 2000);
                return true;
            }
        } catch (error) {
            console.error('Failed to logout WhatsApp client:', error);
            // Force delete session from DB anyway
            await prisma.whatsAppSession.deleteMany({});
            this.client = null;
            this.status = 'DISCONNECTED';
            setTimeout(() => this.initialize(), 2000);
            return false;
        }
    }
}

// Export as singleton
const whatsappService = new WhatsAppService();
module.exports = whatsappService;
