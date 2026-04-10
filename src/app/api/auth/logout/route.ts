import { clearSessionCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(clearSessionCookie());
  return Response.json({ success: true });
}
