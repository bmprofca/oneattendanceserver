import useragent from "useragent";

const LOOPBACK_IPS = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

const normalizeIp = (ip) => {
  if (!ip) return null;

  ip = ip.trim();

  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  return ip;
};

const getClientMeta = (req) => {
  try {
    const headersx = req.headers;

    const ipList = [];

    // Highest priority
    if (req.ip) ipList.push(req.ip);

    // Reverse proxy headers
    if (req.headers["cf-connecting-ip"]) {
      ipList.push(req.headers["cf-connecting-ip"]);
    }

    if (req.headers["x-real-ip"]) {
      ipList.push(req.headers["x-real-ip"]);
    }

    if (req.headers["x-forwarded-for"]) {
      ipList.push(
        ...req.headers["x-forwarded-for"]
          .split(",")
          .map((ip) => ip.trim())
      );
    }

    // Lowest priority (connection between proxy and Node)
    if (req.socket?.remoteAddress) {
      ipList.push(req.socket.remoteAddress);
    }

    const uniqueIps = [...new Set(ipList.map(normalizeIp).filter(Boolean))];

    let ip_v4 = null;
    let ip_v6 = null;

    for (const ip of uniqueIps) {
      if (LOOPBACK_IPS.has(ip)) continue;

      if (ip.includes(":")) {
        ip_v6 ??= ip;
      } else {
        ip_v4 ??= ip;
      }
    }

    // Only use loopback if absolutely nothing else exists
    if (!ip_v4 && !ip_v6) {
      for (const ip of uniqueIps) {
        if (ip.includes(":")) {
          ip_v6 ??= ip;
        } else {
          ip_v4 ??= ip;
        }
      }
    }

    const uaString = req.headers["user-agent"] || null;

    let device_name = "Unknown Device";

    if (uaString) {
      if (uaString.includes("PostmanRuntime")) {
        device_name = "Postman";
      } else {
        const parsedUA = useragent.parse(uaString);

        if (parsedUA.family !== "Other") {
          device_name = `${parsedUA.family} ${parsedUA.major || ""}.${parsedUA.minor || ""} on ${parsedUA.os.family}`;
        }
      }
    }

    return {
      ip_v4,
      ip_v6,
      user_agent: uaString,
      device_name,

      // === Debug ===
      // headersx,
      // remoteAddress: req.socket?.remoteAddress,
      // reqIp: req.ip,
      // ips: req.ips,
      // ipList: uniqueIps,
    };
  } catch (err) {
    console.error("Client meta extraction error:", err);

    return {
      ip_v4: null,
      ip_v6: null,
      user_agent: null,
      device_name: null,
    };
  }
};

export default getClientMeta;