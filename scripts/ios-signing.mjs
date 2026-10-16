// App Store signing for CI, through the App Store Connect API (no Mac keychain or devices needed):
//   node scripts/ios-signing.mjs create <dir>   → a distribution certificate (key + CSR made here) and
//                                                an App Store profile for io.unicornrush.app, written to <dir>
//   node scripts/ios-signing.mjs prune <dir>    → after a successful upload: revokes every OTHER distribution
//                                                certificate and CI profile. The new one must stay valid: TestFlight
//                                                builds can't be installed once their certificate is revoked.
//   node scripts/ios-signing.mjs cleanup <dir>  → after a failed run: revokes this run's certificate and profile
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (the .p8 file). Run on the build machine (needs openssl).
import { execFileSync } from 'node:child_process';
import { sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLE_ID = 'io.unicornrush.app';
const API = 'https://api.appstoreconnect.apple.com/v1';
const [cmd, dir] = process.argv.slice(2);
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
if (!dir || !ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) throw new Error('usage: create|cleanup <dir>, with ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH set');

const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: readFileSync(ASC_KEY_PATH), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// macOS's own openssl (LibreSSL) writes a .p12 the macOS keychain always accepts; Homebrew's OpenSSL 3 may not.
const OPENSSL = process.platform === 'darwin' ? '/usr/bin/openssl' : 'openssl';
const openssl = (...args) => execFileSync(OPENSSL, args, { stdio: ['ignore', 'pipe', 'inherit'] });

if (cmd === 'create') {
  const tag = `UnicornRush CI ${process.env.GITHUB_RUN_ID ?? Date.now()}`;
  // A fresh private key and CSR; the private key never leaves this machine.
  openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'csr.pem'), '-subj', `/CN=${tag}`);
  const csr = readFileSync(join(dir, 'csr.pem'), 'utf8').replace(/-----[^-]+-----|\s/g, '');
  const cert = await api('POST', '/certificates', { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } } });
  writeFileSync(join(dir, 'cert.cer'), Buffer.from(cert.data.attributes.certificateContent, 'base64'));
  openssl('x509', '-inform', 'DER', '-in', join(dir, 'cert.cer'), '-out', join(dir, 'cert.pem'));
  openssl('pkcs12', '-export', '-inkey', join(dir, 'key.pem'), '-in', join(dir, 'cert.pem'), '-out', join(dir, 'cert.p12'), '-passout', 'pass:ci');

  const ids = await api('GET', `/bundleIds?filter[identifier]=${BUNDLE_ID}&limit=10`);
  const bundle = ids.data.find((b) => b.attributes.identifier === BUNDLE_ID);
  if (!bundle) throw new Error(`Bundle ID ${BUNDLE_ID} isn't registered (developer.apple.com → Identifiers).`);
  const profile = await api('POST', '/profiles', {
    data: {
      type: 'profiles',
      attributes: { name: tag, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundle.id } },
        certificates: { data: [{ type: 'certificates', id: cert.data.id }] },
      },
    },
  });
  writeFileSync(join(dir, 'profile.mobileprovision'), Buffer.from(profile.data.attributes.profileContent, 'base64'));
  writeFileSync(join(dir, 'ids.json'), JSON.stringify({ certificate: cert.data.id, profile: profile.data.id }));
  // For the workflow: the profile's name and UUID.
  console.log(`name=${tag}`);
  console.log(`uuid=${profile.data.attributes.uuid}`);
} else if (cmd === 'cleanup') {
  const ids = JSON.parse(readFileSync(join(dir, 'ids.json'), 'utf8'));
  // Revoking a distribution certificate doesn't affect builds already uploaded or on the App Store.
  await api('DELETE', `/profiles/${ids.profile}`).catch((e) => console.error(e.message));
  await api('DELETE', `/certificates/${ids.certificate}`).catch((e) => console.error(e.message));
  console.log('Revoked the CI certificate and deleted its profile.');
} else if (cmd === 'prune') {
  // Keeps the team under Apple's limit of distribution certificates. Note: this revokes ANY other
  // distribution certificate on the team, including one made by hand in Xcode.
  const keep = JSON.parse(readFileSync(join(dir, 'ids.json'), 'utf8'));
  const certs = await api('GET', '/certificates?filter[certificateType]=DISTRIBUTION&limit=200');
  for (const c of certs.data) {
    if (c.id === keep.certificate) continue;
    await api('DELETE', `/certificates/${c.id}`).catch((e) => console.error(e.message));
    console.log(`Revoked older distribution certificate ${c.attributes.serialNumber ?? c.id}.`);
  }
  const profiles = await api('GET', '/profiles?filter[profileType]=IOS_APP_STORE&limit=200');
  for (const pr of profiles.data) {
    if (pr.id === keep.profile || !pr.attributes.name.startsWith('UnicornRush CI ')) continue;
    await api('DELETE', `/profiles/${pr.id}`).catch((e) => console.error(e.message));
  }
  console.log('Kept this build\'s certificate; older CI certificates and profiles removed.');
} else {
  throw new Error(`unknown command ${cmd}`);
}
