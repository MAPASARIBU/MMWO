require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- DIAGNOSA KONEKSI DATABASE ---');
  const url = process.env.DATABASE_URL;
  
  // Tampilkan sebagian URL untuk memastikan ini Railway
  if (url) {
      const isRailway = url.includes('railway');
      console.log(`URL Terdeteksi: ${url.substring(0, 15)}...`);
      console.log(`Apakah Mengarah ke Railway? ${isRailway ? 'YA (Bagus)' : 'TIDAK (Mungkin Localhost?)'}`);
  } else {
      console.log('ERROR: DATABASE_URL tidak ditemukan di file .env');
      return;
  }

  try {
    console.log('\nMencoba mengambil data Mill...');
    const mills = await prisma.mill.findMany();
    console.log(`Jumlah Mill ditemukan: ${mills.length}`);
    mills.forEach(m => console.log(`- ${m.name}`));

    console.log('\nMencoba mengambil data User...');
    const users = await prisma.user.findMany();
    console.log(`Jumlah User ditemukan: ${users.length}`);
    users.forEach(u => console.log(`- ${u.username} (${u.role})`));

  } catch (error) {
    console.error('\nGAGAL TERHUBUNG KE DATABASE:');
    console.error(error.message);
  }
  console.log('---------------------------------');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
