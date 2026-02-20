import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  // A list of all locales that are supported
  locales: ['fr', 'en'],

  // Used when no locale matches
  defaultLocale: 'fr',
  
  // Always use locale prefix in URL
  localePrefix: 'always',
});

export const config = {
  // Match all pathnames except static files and API routes
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
