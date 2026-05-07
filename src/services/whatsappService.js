const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

class WhatsAppService {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        this.qrDataURL = null;
        this.status = 'DISCONNECTED';
        this.lastError = null;

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

    async initialize(retries = 3) {
        console.log('Initializing WhatsApp Service...');
        this.status = 'INITIALIZING';
        try {
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

    /**
     * Send a WhatsApp message
     * @param {string} to - The phone number (e.g., '628123456789')
     * @param {string} message - The text message
     */
    async sendMessage(to, message) {
        if (this.status !== 'CONNECTED') {
            console.warn('Cannot send WhatsApp message: Client is not connected.');
            return false;
        }

        try {
            // Format number to WhatsApp format (append @c.us)
            // Ensure number only contains digits
            let formattedNumber = to.replace(/\D/g, '');
            
            // If it starts with 0, replace with 62 (Indonesian code as default assumption)
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '62' + formattedNumber.substring(1);
            }

            const chatId = `${formattedNumber}@c.us`;
            await this.client.sendMessage(chatId, message);
            return true;
        } catch (error) {
            console.error(`Failed to send WhatsApp message to ${to}:`, error);
            return false;
        }
    }
}

// Export as singleton
const whatsappService = new WhatsAppService();
module.exports = whatsappService;
