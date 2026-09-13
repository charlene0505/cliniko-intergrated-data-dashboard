import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, isCronRequest } from '@/lib/auth';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/showcase', '/api/showcase/referrals', '/api/showcase/patients'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/api/sync' && isCronRequest(request)) {
    return NextResponse.next();
  }

  // Allow public paths through
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get('shp_session')?.value;
  const user = token ? await verifySessionToken(token) : null;

  if (!user) {
    // Not logged in — redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Attach user info to request headers so API routes can read it without re-verifying
  const response = NextResponse.next();
  response.headers.set('x-user-username', user.username);
  response.headers.set('x-user-role', user.role);
  return response;
}

export const config = {
  // Run middleware on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
