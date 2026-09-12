import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, imports, env = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: name => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    process: { env }, Error, TextEncoder, Request, Response, URL, ReadableStream,
    setTimeout: callback => callback(), console: { error() {} },
  });
  return exports;
}

test('environment credentials, missing secrets, and signed sessions', async () => {
  const env = { AUTH_ADMIN_USERNAME: 'clinic-admin', AUTH_ADMIN_PASSWORD: 'test-password', JWT_SECRET: 'test-secret-for-regression-only' };
  const auth = load('src/lib/auth.ts', { jose: await import('jose'), 'next/headers': {} }, env);
  assert.equal(auth.validateCredentials('CLINIC-ADMIN', 'test-password').role, 'admin');
  assert.equal(auth.validateCredentials('admin', 'test-password'), null);
  env.AUTH_OWNER_USERNAME = 'clinic-admin';
  assert.equal(auth.validateCredentials('clinic-admin', 'test-password'), null);
  delete env.AUTH_OWNER_USERNAME;
  assert.equal(auth.validateCredentials('physio', ''), null);
  assert.equal(auth.validateCredentials('__proto__', 'wrong'), null);
  const token = await auth.createSessionToken({ username: 'admin', role: 'admin' });
  assert.equal((await auth.verifySessionToken(token)).username, 'admin');
  delete env.JWT_SECRET;
  assert.equal(await auth.verifySessionToken(token), null);
  await assert.rejects(auth.createSessionToken({ username: 'admin', role: 'admin' }), /JWT_SECRET/);
  const request = new Request('https://example.com/api/sync', { headers: { authorization: 'Bearer cron-test' } });
  assert.equal(auth.isCronRequest(request), false);
  env.CRON_SECRET = 'cron-test';
  assert.equal(auth.isCronRequest(request), true);
  assert.equal(auth.isCronRequest(new Request(request.url)), false);
});

test('daily schedule and middleware allow cron only on sync route', async () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.crons.length, 1);
  assert.equal(config.crons[0].schedule, '0 2 * * *');
  const { middleware } = load('src/middleware.ts', {
    'next/server': { NextResponse: { next: () => new Response(), redirect: url => Response.redirect(url) } },
    '@/lib/auth': { isCronRequest: r => r.headers.get('authorization') === 'Bearer test', verifySessionToken: async () => null },
  });
  const request = path => ({ nextUrl: { pathname: path }, url: `https://example.com${path}`, headers: new Headers({ authorization: 'Bearer test' }), cookies: { get: () => undefined } });
  assert.equal((await middleware(request('/api/sync'))).status, 200);
  assert.equal((await middleware(request('/api/db/test'))).status, 302);
  for (const path of ['/showcase', '/api/showcase/patients', '/api/showcase/referrals']) assert.equal((await middleware(request(path))).status, 200);
  for (const path of ['/api/showcase/sync', '/api/patients', '/showcase/private', '/login-extra']) assert.equal((await middleware(request(path))).status, 302);
});

test('contact failures are deduplicated, streamed, persisted, and sync completes', async () => {
  const updates = [];
  let contactCalls = 0;
  const db = { collection: name => ({
    findOne: async () => null,
    insertOne: async () => ({ insertedId: 'job' }),
    updateOne: async (filter, update) => { updates.push({ name, update }); },
    replaceOne: async () => {},
    aggregate: () => ({ toArray: async () => [] }),
  }) };
  const { GET } = load('src/app/api/sync/route.ts', {
    '@/lib/mongodb': { getDb: async () => db },
    '@/lib/auth': { getSession: async () => null, isCronRequest: r => r.headers.get('authorization') === 'Bearer test' },
    '@/lib/cliniko': { clinikoFetch: async endpoint => {
      if (endpoint.startsWith('/contacts/')) { contactCalls++; throw new Error('Cliniko API error 404: private response body'); }
      return { patients: [1, 2].map(id => ({ id, referring_doctor: { links: { self: 'https://api.au1.cliniko.com/v1/contacts/123' } } })), total_entries: 2, links: {} };
    } },
  });
  assert.equal((await GET(new Request('https://example.com/api/sync'))).status, 401);
  const response = await GET(new Request('https://example.com/api/sync?type=full', { headers: { authorization: 'Bearer test' } }));
  const body = await response.text();
  const events = body.trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
  assert.equal(contactCalls, 1);
  assert.equal(events.filter(e => e.phase === 'warning').length, 1);
  assert.equal(events.at(-1).phase, 'complete');
  assert.match(events.at(-1).contactFailures[0].message, /404/);
  assert.equal(body.includes('private response body'), false);
  assert.equal(updates.filter(u => u.name === 'patients').length, 2);
  assert.equal(updates.find(u => u.update.$set.status === 'complete').update.$set.contactFailures.length, 1);
});
