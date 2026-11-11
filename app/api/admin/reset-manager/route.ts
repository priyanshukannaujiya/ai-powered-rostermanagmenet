import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(16).max(128),
});

export async function POST(req: NextRequest) {
  const expectedToken = process.env.MANAGER_PASSWORD_RESET_TOKEN;
  if (!expectedToken || expectedToken.length < 32) {
    return NextResponse.json({ error: "Reset is not enabled." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reset request." }, { status: 400 });
  }

  const suppliedToken = Buffer.from(parsed.data.token);
  const configuredToken = Buffer.from(expectedToken);
  if (
    suppliedToken.length !== configuredToken.length ||
    !timingSafeEqual(suppliedToken, configuredToken)
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const sql = neon(process.env.DATABASE_URL!);
    const updated = await sql`
      UPDATE users
      SET password_hash = ${passwordHash}, updated_at = now()
      WHERE LOWER(email) = 'manager@opscompany.com' AND role = 'manager'
      RETURNING id;
    `;

    if (updated.length !== 1) {
      console.error("Manager password reset expected exactly one matching account.");
      return NextResponse.json({ error: "Expected manager account was not uniquely found." }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Manager password reset failed:", error);
    return NextResponse.json({ error: "Manager password reset failed." }, { status: 500 });
  }
}
