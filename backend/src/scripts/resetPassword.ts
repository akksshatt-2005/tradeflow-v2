import readline from 'readline';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';

const BCRYPT_ROUNDS = 10;

function askPassword(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resetPassword() {
  const usernameArg = process.argv[2];

  if (!usernameArg) {
    console.error('❌ Error: Username argument is required.');
    console.log('Usage: npm run user:reset-password -- <username>');
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

    console.log(`\n======================================================`);
    console.log(`🔑 Resetting Password for User: ${normalizedUsername}`);
    console.log(`======================================================\n`);

    const newPassword = await askPassword('Enter new password (min 8 characters): ');

    if (!newPassword || newPassword.length < 8) {
      console.error('❌ Password must be at least 8 characters long. Aborting.');
      process.exit(1);
    }

    const confirmPassword = await askPassword('Confirm new password: ');

    if (newPassword !== confirmPassword) {
      console.error('❌ Passwords do not match. Aborting.');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password and revoke all active sessions (Rule B6)
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash }
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: user.id }
      })
    ]);

    console.log(`\n✅ Success: Password updated for "${normalizedUsername}".`);
    console.log(`🔒 All existing refresh tokens and active sessions have been revoked.`);
    console.log(`======================================================\n`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to reset password:', error.message);
    process.exit(1);
  }
}

resetPassword();
