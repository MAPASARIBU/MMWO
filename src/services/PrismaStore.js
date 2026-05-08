const fs = require('fs');

class PrismaStore {
    constructor(prisma) {
        this.prisma = prisma;
    }

    async sessionExists(options) {
        const count = await this.prisma.whatsAppSession.count({ where: { id: options.session } });
        return count > 0;
    }

    async save(options) {
        const zipFile = `${options.session}.zip`;
        if (fs.existsSync(zipFile)) {
            const zipData = fs.readFileSync(zipFile);
            await this.prisma.whatsAppSession.upsert({
                where: { id: options.session },
                update: { data: zipData },
                create: { id: options.session, data: zipData }
            });
        }
    }

    async extract(options) {
        const session = await this.prisma.whatsAppSession.findUnique({ where: { id: options.session } });
        if (session && session.data) {
            fs.writeFileSync(options.path, session.data);
        }
    }

    async delete(options) {
        try {
            await this.prisma.whatsAppSession.delete({ where: { id: options.session } });
        } catch (e) {
            // Ignore if doesn't exist
        }
    }
}

module.exports = PrismaStore;
