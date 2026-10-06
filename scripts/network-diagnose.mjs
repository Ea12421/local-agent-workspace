import dns from 'node:dns/promises';

const hosts = ['registry.npmjs.org', 'api.deepseek.com', 'github.com'];
const timeoutMs = 5000;
const results = [];
for (const host of hosts) {
  const row = { host, dns: null, https: null };
  try {
    const addresses = await dns.lookup(host, { all: true });
    row.dns = { ok: true, addresses: addresses.map((item) => item.address) };
  } catch (error) {
    row.dns = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  try {
    const response = await fetch(`https://${host}`, { signal: AbortSignal.timeout(timeoutMs) });
    row.https = { ok: true, status: response.status };
  } catch (error) {
    row.https = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  results.push(row);
}
const dnsOk = results.every((row) => row.dns.ok);
const httpsOk = results.some((row) => row.https.ok);
console.log(JSON.stringify({
  diagnosis: dnsOk ? (httpsOk ? 'network_reachable' : 'https_blocked') : 'dns_or_egress_blocked',
  results,
  nextSteps: dnsOk && httpsOk ? [] : [
    '检查当前 Wi-Fi/VPN/代理的 DNS 和出站策略',
    '让 registry.npmjs.org、api.deepseek.com、github.com 可解析并访问，或提供可用 npm mirror/offline cache',
    '修复后重新运行 npm run diagnose:network，不要把 DNS 失败当成应用代码失败',
  ],
}, null, 2));
