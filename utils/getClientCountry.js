import getClientMeta from "../utils/ipHelper.js";

const COUNTRY_MAP = Object.freeze({
  IN: {
    code: "IN",
    name: "India",
    dial_code: "91",
  },
  BD: {
    code: "BD",
    name: "Bangladesh",
    dial_code: "880",
  },
  NP: {
    code: "NP",
    name: "Nepal",
    dial_code: "977",
  },
  BT: {
    code: "BT",
    name: "Bhutan",
    dial_code: "975",
  },
  LK: {
    code: "LK",
    name: "Sri Lanka",
    dial_code: "94",
  },
  MM: {
    code: "MM",
    name: "Myanmar",
    dial_code: "95",
  },
  PK: {
    code: "PK",
    name: "Pakistan",
    dial_code: "92",
  },
  CN: {
    code: "CN",
    name: "China",
    dial_code: "86",
  },
});

const DEFAULT_COUNTRY = COUNTRY_MAP.IN;

const LOCAL_IPS = new Set([
  "127.0.0.1",
  "::1",
]);

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

const isPrivateIp = (ip) => {
  if (!ip) return true;

  if (LOCAL_IPS.has(ip)) return true;

  return PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(ip));
};

/**
 * Returns country information.
 * Currently defaults to India until GeoIP integration is added.
 */
const getClientCountry = (req) => {
  const { ip_v4, ip_v6 } = getClientMeta(req);

  const ip = ip_v4 || ip_v6;

  // TODO: Replace with GeoIP lookup.
  if (!ip || isPrivateIp(ip)) {
    return DEFAULT_COUNTRY;
  }

  return DEFAULT_COUNTRY;
};

/**
 * Returns country metadata by ISO code.
 */
const getCountry = (countryCode = "IN") =>
  COUNTRY_MAP[countryCode?.toUpperCase()] || DEFAULT_COUNTRY;

/**
 * Formats a local phone number into E.164.
 *
 * Example:
 * 9876543210 -> +919876543210
 */
const formatPhoneByCountry = (req, phone) => {
  if (!phone) return null;

  const digits = String(phone).replace(/\D/g, "");
  const { dial_code } = getClientCountry(req);

  // Already contains country code
  if (
    digits.startsWith(dial_code) &&
    digits.length > 10
  ) {
    return digits;
  }

  return `${dial_code}${digits}`;
};

export {
  COUNTRY_MAP,
  DEFAULT_COUNTRY,
  getCountry,
  getClientCountry,
  formatPhoneByCountry,
};

export default getClientCountry;