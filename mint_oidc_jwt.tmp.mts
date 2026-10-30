import { readFileSync } from 'node:fs';
const envPath = '/Users/a1234/project/lobehub/.env.local';
const content = readFileSync(envPath, 'utf8');
const env = {};
for (const line of content.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}
const JWKS = JSON.parse(env.JWKS_KEY);
const key = JWKS.keys.find((k) => k.alg === 'RS256' && k.kty === 'RSA');
const { exportJWK, importJWK, SignJWT } = await import('jose');
const privateKey = await importJWK(key, 'RS256');
const sub = process.argv[2] || 'user_B4CubJciRDw2fyv0SC2Pqu2WGaj';
const token = await new SignJWT({ client_id: 'cli' })
  .setProtectedHeader({ alg: 'RS256', kid: key.kid })
  .setSubject(sub)
  .setIssuedAt()
  .setExpirationTime('30s')
  .sign(privateKey);
console.log(token);
