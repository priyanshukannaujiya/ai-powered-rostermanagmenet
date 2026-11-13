import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const user = auth?.user as any;
      const isLoggedIn = !!user;
      const role = user?.role || (auth as any)?.role || (auth as any)?.token?.role;

      const isManagerRoute = nextUrl.pathname.startsWith("/manager");
      const isEmployeeRoute = nextUrl.pathname.startsWith("/me");
      const isLoginRoute = nextUrl.pathname === "/login";

      // If already logged in and visiting /login: redirect to appropriate portal
      if (isLoginRoute && isLoggedIn) {
        if (role === "manager" || role === "pod_lead") {
          return Response.redirect(new URL("/manager", nextUrl));
        }
        return Response.redirect(new URL("/me", nextUrl));
      }

      // Manager / Pod Lead portal
      if (isManagerRoute) {
        if (!isLoggedIn) return false;
        if (role !== "manager" && role !== "pod_lead") {
          // Employee trying to access manager route: redirect to /me instead of login redirect loop
          return Response.redirect(new URL("/me", nextUrl));
        }
      }

      // Employee portal
      if (isEmployeeRoute) {
        if (!isLoggedIn) return false;
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.employeeId = (user as any).employeeId;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        if (!session.user) {
          (session as any).user = {} as any;
        }
        session.user.id = (token.id as string) || (token.sub as string);
        (session.user as any).role = token.role as string;
        (session.user as any).employeeId = token.employeeId as string | null;
      }
      return session;
    },
  },
  providers: [], // Configured with credentials in auth.ts
};

