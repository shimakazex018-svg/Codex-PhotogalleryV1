function normalizeAddress(value) {
  const address = String(value || "").trim().toLowerCase();
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function ipv4Number(value) {
  const parts = normalizeAddress(value).split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
}

function parseTrustedCidrs(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean).map((item, index) => {
    const match = item.match(/^(?:(lan|zerotier):)?([^/]+)\/(\d{1,2})$/i);
    if (!match) return null;
    const network = ipv4Number(match[2]);
    const prefix = Number(match[3]);
    if (network === null || prefix < 0 || prefix > 32) return null;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return { scope: match[1] ? `trusted-${match[1].toLowerCase()}` : index === 0 ? "trusted-lan" : "trusted-zerotier", network: network & mask, mask };
  }).filter(Boolean);
}

function createAdminAuthorizer(config = {}) {
  const enabled = config.enabled === true || /^(1|true)$/i.test(String(config.enabled || ""));
  const cidrs = parseTrustedCidrs(config.cidrs);
  const origins = new Set(String(config.origins || "").split(",").map((item) => item.trim().replace(/\/$/, "")).filter(Boolean));

  function capability(request) {
    const sourceAddress = normalizeAddress(request?.socket?.remoteAddress);
    let scope = ["127.0.0.1", "::1"].includes(sourceAddress) ? "local" : "denied";
    if (scope === "denied" && enabled) {
      const address = ipv4Number(sourceAddress);
      const match = address === null ? null : cidrs.find((item) => (address & item.mask) === item.network);
      if (match) scope = match.scope;
    }
    const origin = String(request?.headers?.origin || "").trim().replace(/\/$/, "");
    const originAllowed = !origin || origins.has(origin);
    const authorized = scope !== "denied" && originAllowed;
    return { authorized, scope: authorized ? scope : "denied", sourceAddress, originAllowed };
  }

  function authorize(request, action = "admin-write") {
    const result = capability(request);
    if (!result.authorized) {
      const error = new Error(result.originAllowed ? `Admin action '${action}' is not allowed from this network.` : "Origin is not allowed for admin writes.");
      error.statusCode = 403;
      throw error;
    }
    return result;
  }

  return { capability, authorize };
}

module.exports = { createAdminAuthorizer, normalizeAddress, parseTrustedCidrs };
