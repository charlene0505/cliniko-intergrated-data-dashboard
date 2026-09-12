import { validateCredentials, createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const user = validateCredentials(username, password);
    if (!user) {
      return Response.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const token = await createSessionToken(user);
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieOptions(token));

    return Response.json({ success: true, role: user.role });

  } catch {
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}
