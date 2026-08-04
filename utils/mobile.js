export function normalizeIndianMobile(input) {
  if (input == null) {
    throw new Error("Mobile number is required");
  }

  // Keep only digits
  let mobile = String(input).replace(/\D/g, "");

  // Remove leading international prefix
  while (mobile.startsWith("00")) {
    mobile = mobile.slice(2);
  }

  // Remove leading zeros
  while (mobile.startsWith("0")) {
    mobile = mobile.slice(1);
  }

  // Keep only the last 10 digits if country code exists
  if (mobile.length > 10) {
    mobile = mobile.slice(-10);
  }

  // Must be exactly 10 digits
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new Error("Invalid Indian mobile number");
  }

  return "91" + mobile;
}