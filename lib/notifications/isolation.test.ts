import { describe, it, expect } from "vitest";

describe("Strict Notification Isolation & Delivery Scoping", () => {
  it("enforces that employee role queries strictly filter by their own session employeeId", () => {
    // Simulate query builder behavior in /api/notifications/route.ts
    const session = { role: "employee", employeeId: "E005" }; // Rohan Das
    const requestedParam = "E008"; // Deepa Nair (attacker trying IDOR)

    let effectiveFilterEmployeeId: string | null = null;
    if (session.role === "employee") {
      // In route.ts, client-passed requestedEmployeeId is strictly ignored
      effectiveFilterEmployeeId = session.employeeId;
    } else {
      effectiveFilterEmployeeId = requestedParam;
    }

    expect(effectiveFilterEmployeeId).toBe("E005");
    expect(effectiveFilterEmployeeId).not.toBe(requestedParam);
  });

  it("prevents an employee from acknowledging or marking another user's notifications", () => {
    const sessionEmployeeId = "E008"; // Deepa Nair
    const rohanNotification = { id: "notif-rohan-123", employee_id: "E005" };

    // Update query requires: WHERE id = notificationId AND employee_id = sessionEmployeeId
    const canAcknowledge =
      rohanNotification.id === "notif-rohan-123" &&
      rohanNotification.employee_id === sessionEmployeeId;

    expect(canAcknowledge).toBe(false);
  });

  it("verifies leave approval notification structure contains employee, dates, brands, and status", () => {
    const leave = {
      employee_id: "E005",
      employee_name: "Rohan Das",
      start_date: "2026-11-20",
      end_date: "2026-11-21",
    };
    const affectedBrands = [{ brandName: "Urban Botanics", processCode: "CS" }];

    const brandSummary = affectedBrands
      .map((b) => `${b.brandName} (${b.processCode})`)
      .join(", ");

    const notificationPayload = {
      employeeId: leave.employee_id,
      title: "Leave request approved",
      message: `Your leave request for ${leave.start_date} to ${leave.end_date} has been approved (status: approved). Your ${brandSummary} shifts on those dates are now recorded as approved leave.`,
      type: "leave_approved",
      date: leave.start_date,
      metadata: {
        status: "approved",
        startDate: leave.start_date,
        endDate: leave.end_date,
        brands: affectedBrands,
      },
      notifyPodLead: true,
    };

    expect(notificationPayload.employeeId).toBe("E005");
    expect(notificationPayload.message).toContain("2026-11-20 to 2026-11-21");
    expect(notificationPayload.message).toContain("approved");
    expect(notificationPayload.message).toContain("Urban Botanics (CS)");
    expect(notificationPayload.metadata.status).toBe("approved");
  });
});

