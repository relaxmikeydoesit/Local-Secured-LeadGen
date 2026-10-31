// Tests for the contact Pages Function. No dependencies: run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequest } from '../functions/api/contact.js';

const ENV = {
  TURNSTILE_SECRET_KEY: 's', RESEND_API_KEY: 'r', CONTACT_TO: 'owner@example.com', CONTACT_FROM: 'Site <no-reply@example.com>',
};
const URL_ = 'https://site.example/api/contact';

function req(fields, { headers = {}, origin = 'https://site.example' } = {}) {
  const body = new URLSearchParams(fields);
  return new Request(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(origin ? { Origin: origin } : {}), ...headers },
    body,
  });
}
const good = { name: 'Pat', email: 'pat@example.com', message: 'Hello there', 'cf-turnstile-response': 'tok' };

// Mock global fetch: first call = Turnstile, second = Resend.
function mockFetch({ turnstile = true, resendOk = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('turnstile')) return new Response(JSON.stringify({ success: turnstile }));
    return new Response('{}', { status: resendOk ? 200 : 500 });
  };
  return calls;
}
const loc = (res) => new URL(res.headers.get('Location')).pathname;

test('happy path sends one email and redirects to thanks', async () => {
  const calls = mockFetch();
  const res = await onRequestPost({ request: req(good), env: ENV });
  assert.equal(res.status, 303);
  assert.equal(loc(res), '/contact/thanks/');
  assert.equal(calls.length, 2);
  const mail = JSON.parse(calls[1].init.body);
  assert.deepEqual(mail.to, ['owner@example.com']);
  assert.equal(mail.reply_to, 'pat@example.com');
});

test('cross-origin POST is rejected before any network call', async () => {
  const calls = mockFetch();
  const res = await onRequestPost({ request: req(good, { origin: 'https://evil.example' }), env: ENV });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('wrong content type is rejected', async () => {
  mockFetch();
  const r = new Request(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://site.example' }, body: '{}' });
  assert.equal((await onRequestPost({ request: r, env: ENV })).status, 415);
});

test('oversized body is rejected', async () => {
  mockFetch();
  const res = await onRequestPost({ request: req(good, { headers: { 'Content-Length': '999999' } }), env: ENV });
  assert.equal(res.status, 413);
});

test('honeypot looks like success but sends nothing', async () => {
  const calls = mockFetch();
  const res = await onRequestPost({ request: req({ ...good, website: 'http://spam' }), env: ENV });
  assert.equal(loc(res), '/contact/thanks/');
  assert.equal(calls.length, 0);
});

test('invalid input goes to the error page without network calls', async () => {
  for (const bad of [
    { ...good, email: 'not-an-email' },
    { ...good, name: '' },
    { ...good, message: 'x'.repeat(3001) },
    { ...good, name: 'x'.repeat(101) },
  ]) {
    const calls = mockFetch();
    const res = await onRequestPost({ request: req(bad), env: ENV });
    assert.equal(loc(res), '/contact/error/');
    assert.equal(calls.length, 0);
  }
});

test('failed Turnstile blocks delivery', async () => {
  const calls = mockFetch({ turnstile: false });
  const res = await onRequestPost({ request: req(good), env: ENV });
  assert.equal(loc(res), '/contact/error/');
  assert.equal(calls.length, 1); // only the verification call
});

test('missing Turnstile token blocks delivery', async () => {
  const calls = mockFetch();
  const { ['cf-turnstile-response']: _, ...noTok } = good;
  const res = await onRequestPost({ request: req(noTok), env: ENV });
  assert.equal(loc(res), '/contact/error/');
  assert.equal(calls.length, 0);
});

test('email provider failure shows the error page', async () => {
  mockFetch({ resendOk: false });
  assert.equal(loc(await onRequestPost({ request: req(good), env: ENV })), '/contact/error/');
});

test('missing secrets fail closed', async () => {
  const calls = mockFetch();
  const res = await onRequestPost({ request: req(good), env: { ...ENV, RESEND_API_KEY: '' } });
  assert.equal(loc(res), '/contact/error/');
  assert.equal(calls.length, 0);
});

test('header injection via newline in name cannot reach the subject', async () => {
  const calls = mockFetch();
  await onRequestPost({ request: req({ ...good, name: 'Pat\r\nBcc: evil@example.com' }), env: ENV });
  const mail = JSON.parse(calls[1].init.body);
  assert.ok(!/[\r\n]/.test(mail.subject));
  assert.ok(!/[\r\n]/.test(mail.reply_to));
});

test('other methods get 405 with Allow: POST', () => {
  const res = onRequest();
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
});
