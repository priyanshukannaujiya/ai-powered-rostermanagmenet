import { describe, expect, it } from "vitest";
import { isExplicitLeaveApprovalRequest, isExplicitNotificationRequest } from "./intent";

describe("isExplicitNotificationRequest", () => {
  it("accepts a direct request to notify", () => {
    expect(isExplicitNotificationRequest("Please notify Alex Smith about the assignment.")).toBe(true);
  });

  it("does not treat asking whether to notify as permission", () => {
    expect(isExplicitNotificationRequest("Should I notify Alex Smith?")).toBe(false);
  });

  it("does not send a notification when the manager says not to", () => {
    expect(isExplicitNotificationRequest("Do not notify Alex Smith.")).toBe(false);
  });

  it("accepts confirmation after the assistant offered to notify", () => {
    expect(
      isExplicitNotificationRequest("Yes", "Would you like me to notify Alex Smith?")
    ).toBe(true);
  });

  it("does not treat an unrelated yes as notification permission", () => {
    expect(isExplicitNotificationRequest("Yes", "The assignment is ready.")).toBe(false);
  });

  it("allows a direct leave approval command", () => {
    expect(isExplicitLeaveApprovalRequest("Approve Priya's leave request")).toBe(true);
  });

  it("does not approve a hypothetical leave question", () => {
    expect(isExplicitLeaveApprovalRequest("If I approve Priya's leave, will coverage conflict?")).toBe(false);
  });

  it("does not approve when the manager says not to", () => {
    expect(isExplicitLeaveApprovalRequest("Do not approve Priya's leave request.")).toBe(false);
  });
});
