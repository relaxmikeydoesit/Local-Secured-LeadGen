// Cloudflare Pages Function: POST /api/contact
//
// Defenses, in order: origin check, content-type and size limits, honeypot,
// strict validation, Turnstile verification (server side), then email delivery.
// Nothing is stored. Message contents are never logged.
//
// Required secrets (Pages project settings, or .dev.vars locally):
//   TURNSTILE_SECRET_KEY, RESEND_API_KEY, CONTACT_TO, CONTACT_FROM

const LIMITS = { name: 100, email: 254, message: 3000 };
const MAX_BODY_BYTES = 20_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

// Single-line fields: drop all control characters, including newlines (blocks header injection).
// Multi-line fields: drop control characters except tab, LF and CR.
const clean = (value, multiline = false) => {
  if (typeof value !== 'string') return '';
  const pattern = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(pattern, ' ').trim();
};

const redirect = (request, path) =>
  new Response(null, {
    status: 303,
    headers: { ...BASE_HEADERS, Location: new URL(path, request.url).toString() },
  });

const reject = (status, text) => new Response(text, { status, headers: BASE_HEADERS });

async function verifyTurnstile(token, secret, ip) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (ip) body.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  // Same-origin only. Browsers always send Origin on cross-site POSTs.
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return reject(403, 'Forbidden');

  const type = request.headers.get('Content-Type') || '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(type)) {
    return reject(415, 'Unsupported media type');
  }
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) {
    return reject(413, 'Payload too large');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return redirect(request, '/contact/error/');
  }

  // Honeypot: pretend success so bots learn nothing.
  if (clean(form.get('website'))) return redirect(request, '/contact/thanks/');

  const name = clean(form.get('name'));
  const email = clean(form.get('email'));
  const message = clean(form.get('message'), true);

  const valid =
    name.length > 0 && name.length <= LIMITS.name &&
    email.length > 0 && email.length <= LIMITS.email && EMAIL_RE.test(email) &&
    message.length > 0 && message.length <= LIMITS.message;
  if (!valid) return redirect(request, '/contact/error/');

  if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error('Contact form is not configured: missing secret(s).');
    return redirect(request, '/contact/error/');
  }

  const human = await verifyTurnstile(
    form.get('cf-turnstile-response'),
    env.TURNSTILE_SECRET_KEY,
    request.headers.get('CF-Connecting-IP'),
  );
  if (!human) return redirect(request, '/contact/error/');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: email,
        subject: `Website inquiry from ${name}`.slice(0, 150),
        text: `Name: ${name}\nEmail: ${email}\n\n${message}\n`,
      }),
    });
    if (!res.ok) {
      console.error('Email delivery failed with status', res.status);
      return redirect(request, '/contact/error/');
    }
  } catch {
    console.error('Email delivery request threw.');
    return redirect(request, '/contact/error/');
  }

  return redirect(request, '/contact/thanks/');
}

// Any other method.
export function onRequest() {
  return new Response('Method not allowed', {
    status: 405,
    headers: { ...BASE_HEADERS, Allow: 'POST' },
  });
}
