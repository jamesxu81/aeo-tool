import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Protect /app/** and /api/projects/**. Public: /, /admin (basic-auth), /api/waitlist, /api/webhooks/*
const isProtected = createRouteMatcher(['/app(.*)', '/api/projects(.*)', '/api/checkout(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
