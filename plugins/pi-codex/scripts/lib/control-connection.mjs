const LOCAL_ACCESS_DENIAL_CODES = new Set(["EPERM", "EACCES"]);

export function localControlAccessDenialCode(error) {
  const seen = new Set();
  let current = error;
  while (current && (typeof current === "object" || typeof current === "function") && !seen.has(current)) {
    seen.add(current);
    if (LOCAL_ACCESS_DENIAL_CODES.has(current.code)) return current.code;
    current = current.cause;
  }
  return null;
}
