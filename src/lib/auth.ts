import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// ── Role definitions ───────────────────────────────────────────────────────

export type UserRole = 'admin' | 'owner' | 'physio';

export interface AuthUser {
  username: string;
  role: UserRole;
}

// An unset username or password disables that account; roles stay server-controlled.
export function validateCredentials(username: string, password: string): AuthUser | null {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const accounts: { username?: string; password?: string; role: UserRole }[] = [
    { username: process.env.AUTH_ADMIN_USERNAME, password: process.env.AUTH_ADMIN_PASSWORD, role: 'admin' },
    { username: process.env.AUTH_OWNER_USERNAME, password: process.env.AUTH_OWNER_PASSWORD, role: 'owner' },
    { username: process.env.AUTH_PHYSIO_USERNAME, password: process.env.AUTH_PHYSIO_PASSWORD, role: 'physio' },
  ];
  const matches = accounts.filter(account => account.username?.trim().toLowerCase() === username.trim().toLowerCase());
  if (matches.length !== 1) return null;
  const account = matches[0];
  if (!account.username?.trim() || !account.password || account.password !== password) return null;
  return { username: account.username.trim(), role: account.role };
}

// ── JWT helpers ────────────────────────────────────────────────────────────

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
}

export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

const COOKIE_NAME = 'shp_session';
const SESSION_DURATION = 60 * 60 * 8; // 8 hours in seconds

export async function createSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      username: payload.username as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION,
    path: '/',
  };
}

export function clearSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
}

// ── Role-based permissions skeleton ───────────────────────────────────────
// Fill these in as requirements become clear.

export const Permissions = {
  // Can the user trigger a manual sync?
  canSync: (role: UserRole): boolean => {
    switch (role) {
      case 'admin': return true;
      case 'owner': return true;
      case 'physio': return false;
      default: return false;
    }
  },

  // Can the user see the debug panel?
  canViewDebug: (role: UserRole): boolean => {
    switch (role) {
      case 'admin': return true;
      case 'owner': return false;
      case 'physio': return false;
      default: return false;
    }
  },

  // Can the user manage other users? (placeholder — no user management yet)
  canManageUsers: (role: UserRole): boolean => {
    switch (role) {
      case 'admin': return true;
      case 'owner': return false;
      case 'physio': return false;
      default: return false;
    }
  },

  // Can the user view all referral periods or only selected ones?
  // (placeholder — restrict physio to recent periods only if needed)
  canViewAllPeriods: (role: UserRole): boolean => {
    switch (role) {
      case 'admin': return true;
      case 'owner': return true;
      case 'physio': return true;
      default: return false;
    }
  },
};
