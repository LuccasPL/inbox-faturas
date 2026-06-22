import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/clientes(.*)',
  '/inbox(.*)',
  '/settings(.*)',
]);

// Rotas públicas que nunca podem exigir login
const isPublicRoute = createRouteMatcher([
  '/api/webhooks(.*)',
  '/p/(.*)',         // proforma partilhada por token
  '/api/p/(.*)',     // PDF da proforma partilhada
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return; // não protege webhooks nem links públicos
  }
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
