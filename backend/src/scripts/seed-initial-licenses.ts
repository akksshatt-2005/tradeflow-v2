import prisma from '../prisma.js';

function generateLicenseKey(prefix = 'TF'): string {
  const year = new Date().getFullYear();
  const chunk = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${year}-${chunk()}-${chunk()}-${chunk()}`;
}

async function main() {
  console.log('--- Seeding Initial Licenses for Existing Companies ---');
  const companies = await prisma.company.findMany({
    include: {
      licenses: true,
      userCompanies: {
        include: {
          user: true
        }
      }
    }
  });

  console.log(`Found ${companies.length} existing companies.`);

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  for (const company of companies) {
    if (company.licenses.length > 0) {
      console.log(`Company "${company.name}" already has ${company.licenses.length} license(s). Skipping.`);
      continue;
    }

    const primaryEmail = company.email || company.userCompanies[0]?.user.username || 'admin@tradeflow.local';
    const key = generateLicenseKey();

    const license = await prisma.license.create({
      data: {
        licenseKey: key,
        registeredEmail: primaryEmail,
        companyId: company.id,
        planType: 'WHOLESALE',
        status: 'ACTIVE',
        maxUsers: 5,
        gracePeriodDays: 7,
        issuedAt: new Date(),
        activatedAt: new Date(),
        expiresAt: oneYearFromNow,
        notes: 'Initial automatic 1-year license for existing TradeFlow company.'
      }
    });

    console.log(`✅ Granted 1-Year License to "${company.name}": ${license.licenseKey} (Valid until ${license.expiresAt.toISOString().split('T')[0]})`);
  }

  console.log('--- License Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Failed to seed licenses:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
