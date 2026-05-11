import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no Credentials provider, no DB / bcrypt imports).
 * Used by middleware for route protection. The full config (with providers)
 * lives in `lib/auth.ts` and is used by API routes / server components.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Public paths
      if (
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/health") ||
        pathname.startsWith("/_next")
      ) {
        return true;
      }

      return isLoggedIn;
    },
  },
};
