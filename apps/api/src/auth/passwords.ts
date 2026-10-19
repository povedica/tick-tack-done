import argon2 from 'argon2';

/** Section 15. Passwords are Argon2id. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: string | null = null;

/** Always runs Argon2 so a missing account is not faster than a wrong password (S-01). */
export async function verifyPresentedPassword(
  hash: string | null,
  password: string,
): Promise<boolean> {
  dummyHash ??= await hashPassword('not-a-real-account');
  const ok = await verifyPassword(hash ?? dummyHash, password);
  return hash !== null && ok;
}
