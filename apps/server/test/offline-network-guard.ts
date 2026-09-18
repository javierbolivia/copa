// Full-suite default: fake injected transports remain usable, accidental Internet does not.
// Local HTTP is reserved for tests that explicitly exercise a loopback server.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new Error("OFFLINE_TEST_EXTERNAL_NETWORK_BLOCKED");
  return originalFetch(input,init);
};
