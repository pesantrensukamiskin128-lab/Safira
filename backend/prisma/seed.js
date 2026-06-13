const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Buat profil organisasi default
  const existingProfil = await prisma.organisasiProfil.findFirst();
  if (!existingProfil) {
    await prisma.organisasiProfil.create({
      data: {
        tingkatanOrg: 'Sekretaris',
        namaOrg:      'Forum Pondok Pesantren (FPP) Kota Bandung',
        daerahOrg:    'Kota Bandung',
        alamat:       '',
        telepon:      '',
        email:        '',
        website:      '',
      },
    });
    console.log('✅ Profil organisasi default dibuat');
  }

  // Buat admin default
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@risalatren.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    await prisma.user.create({
      data: {
        email: 'admin@risalatren.com',
        password: hashedPassword,
        namaLengkap: 'Administrator',
        jabatan: 'Administrator Sistem',
        role: 'ADMIN',
      },
    });
    console.log('✅ Admin default dibuat: admin@risalatren.com / admin123');
  }

  // Buat user contoh
  const users = [
    {
      email: 'sekretaris@risalatren.com',
      namaLengkap: 'Siti Aminah',
      jabatan: 'Sekretaris',
      role: 'SEKRETARIS',
    },
    {
      email: 'kepala@risalatren.com',
      namaLengkap: 'Bapak Kepala',
      jabatan: 'Kepala Pondok Pesantren',
      role: 'KEPALA',
    },
    {
      email: 'pengurus1@risalatren.com',
      namaLengkap: 'Nur Hidayah',
      jabatan: 'Ustadz/Ustadzah',
      role: 'PENGURUS',
    },
    {
      email: 'pengurus2@risalatren.com',
      namaLengkap: 'Aisyah Putri',
      jabatan: 'Ustadz/Ustadzah',
      role: 'PENGURUS',
    },
  ];

  for (const userData of users) {
    const existing = await prisma.user.findUnique({
      where: { email: userData.email },
    });
    if (!existing) {
      const hashedPassword = await bcrypt.hash('password123', 12);
      await prisma.user.create({
        data: { ...userData, password: hashedPassword },
      });
      console.log(`✅ User dibuat: ${userData.email} / password123`);
    }
  }

  console.log('🎉 Seeding selesai!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
