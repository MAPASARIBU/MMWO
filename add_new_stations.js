const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const mills = await prisma.mill.findMany();
    const newStations = ['CPO Washing Plant', 'VEHICLE'];

    for (const mill of mills) {
        for (const stationName of newStations) {
            const existing = await prisma.station.findFirst({
                where: { name: stationName, mill_id: mill.id }
            });
            
            if (!existing) {
                await prisma.station.create({
                    data: {
                        name: stationName,
                        mill_id: mill.id
                    }
                });
                console.log(`Added ${stationName} to ${mill.name}`);
            } else {
                console.log(`${stationName} already exists in ${mill.name}`);
            }
        }
    }
}

main()
  .catch(e => {
      console.error(e);
      process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
