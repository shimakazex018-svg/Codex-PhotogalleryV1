const assert = require("assert");
const { createAdminAuthorizer } = require("../admin-auth");

const auth = createAdminAuthorizer({ enabled: true, cidrs: "lan:192.168.31.0/24,zerotier:192.168.192.0/24", origins: "http://127.0.0.1:48102,http://192.168.31.153:48102,http://192.168.192.1:48102" });
const request = (address, origin = "", forwarded = "") => ({ socket: { remoteAddress: address }, headers: { origin, "x-forwarded-for": forwarded } });
assert.equal(auth.capability(request("127.0.0.1", "http://127.0.0.1:48102")).scope, "local");
assert.equal(auth.capability(request("::ffff:192.168.31.25", "http://192.168.31.153:48102")).scope, "trusted-lan");
assert.equal(auth.capability(request("192.168.192.44", "http://192.168.192.1:48102")).scope, "trusted-zerotier");
assert.equal(auth.capability(request("10.10.10.10", "http://127.0.0.1:48102", "127.0.0.1")).authorized, false);
assert.equal(auth.capability(request("192.168.31.25", "http://evil.invalid", "127.0.0.1")).authorized, false);
assert.equal(auth.capability(request("192.168.31.25", "http://192.168.31.153:48102", "10.10.10.10")).authorized, true);
console.log("ADMIN_AUTH_TEST=PASS");
