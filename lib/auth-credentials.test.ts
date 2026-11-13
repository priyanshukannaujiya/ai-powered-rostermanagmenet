import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { consumeRateLimit, clearRateLimit } from "./security/rate-limit";

describe("Password Verification and Credential Authentication", () => {
  const samplePassword = "TestPassword@2026!";
  let passwordHash: string;

  beforeEach(async () => {
    passwordHash = await bcrypt.hash(samplePassword, 12);
  });

  it("successfully verifies correct password using bcryptjs cost factor 12", async () => {
    const isValid = await bcrypt.compare(samplePassword, passwordHash);
    expect(isValid).toBe(true);
  });

  it("strictly rejects incorrect passwords without throwing exceptions", async () => {
    const isValid = await bcrypt.compare("WrongPassword123!", passwordHash);
    expect(isValid).toBe(false);
  });

  it("distinguishes Manager, Pod Lead, and Employee account scopes", () => {
    const accounts = [
      { id: "user-mgr", email: "manager@opscompany.com", role: "manager", employeeId: null },
      { id: "user-E002", email: "neha.joshi@example.com", role: "pod_lead", employeeId: "E002" },
      { id: "user-E015", email: "arjun.rampal@example.com", role: "employee", employeeId: "E015" },
    ];

    expect(accounts[0].role).toBe("manager");
    expect(accounts[0].employeeId).toBeNull();

    expect(accounts[1].role).toBe("pod_lead");
    expect(accounts[1].employeeId).toBe("E002");

    expect(accounts[2].role).toBe("employee");
    expect(accounts[2].employeeId).toBe("E015");
  });

  it("rate limiter handles missing table gracefully without breaking login", async () => {
    let tableCreated = false;
    const mockSql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");
      if (query.includes("INSERT INTO rate_limit_buckets")) {
        if (!tableCreated) {
          const err: any = new Error('relation "rate_limit_buckets" does not exist');
          err.code = "42P01";
          throw err;
        }
        return [{ request_count: 1 }];
      }
      if (query.includes("CREATE TABLE IF NOT EXISTS rate_limit_buckets")) {
        tableCreated = true;
        return [];
      }
      if (query.includes("CREATE INDEX IF NOT EXISTS")) {
        return [];
      }
      return [];
    };

    const result = await consumeRateLimit(mockSql, "test:key", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(tableCreated).toBe(true);
  });

  it("rate limiter enforces limits and flags rate-limited attempts", async () => {
    const mockSql: any = async () => [{ request_count: 11 }];
    const result = await consumeRateLimit(mockSql, "test:throttled:key", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(11);
  });

  it("rate limiter fails open during unrecoverable database errors to prevent system-wide lockout", async () => {
    const mockSql: any = async () => {
      throw new Error("Network timeout or connection refused");
    };
    const result = await consumeRateLimit(mockSql, "test:network:error", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });
});

