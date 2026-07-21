import useragent from "useragent";

const getClientMeta = (req) => {
  try {
    const xForwardedFor = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const cfConnectingIp = req.headers["cf-connecting-ip"];

    let ipList = [];
 
    if (cfConnectingIp) ipList.push(cfConnectingIp);

    if (xForwardedFor) {
      ipList.push(...xForwardedFor.split(",").map(ip => ip.trim()));
    }

    if (xRealIp) ipList.push(xRealIp);

    if (req.socket?.remoteAddress) ipList.push(req.socket.remoteAddress);

    if (req.ip) ipList.push(req.ip);

    ipList = [...new Set(ipList.filter(Boolean))];

    let ip_v4 = null;
    let ip_v6 = null;
  
    for (let ip of ipList) {
      if (!ip) continue;

      if (ip.startsWith("::ffff:")) {
        ip = ip.replace("::ffff:", "");
      }

      if (ip === "::1") {
        ip = "127.0.0.1";
      }

      if (ip.includes(":")) {
        if (!ip_v6) ip_v6 = ip;
      } else {
        if (!ip_v4) ip_v4 = ip;
      }

      if (ip_v4 && ip_v6) break;
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