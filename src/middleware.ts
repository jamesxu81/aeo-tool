import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const hasClerk = !!clerkKey && clerkKey.startsWith('pk_') && !clerkKey.includes('placeholder');

// Protect /app/** and mutating project/checkout APIs when Clerk is on.
const isProtected = createRouteMatcher(['/app(.*)', '/api/projects(.*)', '/api/checkout(.*)']);

const clerkMw = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

// No-op middleware: allow everything through but steer /app to a setup notice.
function noopMw(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/app') || req.nextUrl.pathname === '/sign-in' || req.nextUrl.pathname === '/sign-up') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('setup', 'clerk-missing');
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export default hasClerk ? clerkMw : noopMw;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
