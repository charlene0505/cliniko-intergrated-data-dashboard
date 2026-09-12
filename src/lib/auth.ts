import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// ── Role definitions ───────────────────────────────────────────────────────

export type UserRole = 'admin' | 'owner' | 'physio';

export interface AuthUser {
  username: string;
  role: UserRole;
}

// ── Hardcoded users (replace with DB lookup later) ─────────────────────────

const USERS: Record<string, { password: string; role: UserRole }> = {
  admin:  { password: 'admin123',  role: 'admin'  },
  owner:  { password: 'owner123',  role: 'owner'  },
  physio: { password: 'physio123', role: 'physio' },
};

export function validateCredentials(username: string, password: string): AuthUser | null {
  const user = USERS[username.toLowerCase()];
  if (!user || user.password !== password) return null;
  return { username: username.toLowerCase(), role: user.role };
}

// ── JWT helpers ────────────────────────────────────────────────────────────

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'shp_session';
const SESSION_DURATION = 60 * 60 * 8; // 8 hours in seconds

export async function createSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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
