import prisma from '../prisma.js';

async function revokeSessions() {
  const usernameArg = process.argv[2];

  if (!usernameArg) {
    console.error('❌ Error: Username argument is required.');
    console.log('Usage: npm run user:revoke-sessions -- <username>');
    process.exit(1);
  }

  const normalizedUsername = usernameArg.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername }
    });

    if (!user) {
      console.error(`❌ User "${normalizedUsername}" not found in database.`);
      process.exit(1);
    }

    const deleteResult = await prisma.refreshToken.deleteMany({
      where: { userId: user.id }
    });

    console.log(`\n======================================================`);
    console.log(`🔒 Session Revocation Complete`);
    console.log(`User: ${normalizedUsername}`);
    console.log(`Revoked Tokens: ${deleteResult.count} session(s)`);
    console.log(`======================================================\n`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to revoke sessions:', error.message);
    process.exit(1);
  }
}

revokeSessions();
