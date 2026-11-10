export function isExplicitNotificationRequest(
  message: string,
  previousAssistantMessage = ""
): boolean {
  const normalized = message.trim().toLowerCase();
  if (
    /\b(don't|do not|never|not yet)\s+(?:notify|alert|message|send)\b/.test(normalized) ||
    /\b(should i|should we|would you like me to|do you want me to|shall i)\b/.test(normalized)
  ) {
    return false;
  }

  if (/\b(notify|alert|message|send (?:a|an) notification)\b/.test(normalized)) {
    return true;
  }

  const isConfirmation = /^(yes|yeah|yep|sure|please do|go ahead|do that|confirm)[.! ]*$/i.test(
    message.trim()
  );
  return isConfirmation && /\b(notify|notification|alert)\b/i.test(previousAssistantMessage) &&
    previousAssistantMessage.includes("?");
}

export function isExplicitLeaveApprovalRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (
    /\b(don't|do not|never|not yet)\s+(?:approve|accept)\b/.test(normalized) ||
    /\b(if|whether|should i|should we|what if|would approving)\b/.test(normalized)
  ) {
    return false;
  }
  return /\b(approve|accept)\b.*\b(leave|request)\b/.test(normalized);
}
