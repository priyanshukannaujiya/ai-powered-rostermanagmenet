import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as any)?.role;

      const isManagerRoute = nextUrl.pathname.startsWith("/manager");
      const isEmployeeRoute = nextUrl.pathname.startsWith("/me");

      if (isManagerRoute) {
        if (!isLoggedIn) return false;
        if (role !== "manager" && role !== "pod_lead") return false;
      }

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
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).employeeId = token.employeeId as string | null;
      }
      return session;
    },
  },
  providers: [], // Configured with credentials in auth.ts
};

