import { createHmac, timingSafeEqual } from 'node:crypto';

type CouponTicketPayload = {
  amountCny: number;
  code: string;
  exp: number;
  scope: 'subscription' | 'topup';
  userId: string;
};

function secret(): string {
  return (
    process.env.KEY_VAULTS_SECRET ||
    process.env.APP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'lobe-coupon-dev-secret'
  );
}

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromB64url(input: string) {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replaceAll('-', '+').replaceAll('_', '/') + pad;
  return Buffer.from(b64, 'base64');
}

export function signCouponTicket(payload: CouponTicketPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyCouponTicket(
  ticket: string,
  expect: { amountCny: number; scope: 'subscription' | 'topup'; userId: string },
): { code: string } {
  const [body, sig] = ticket.split('.');
  if (!body || !sig) throw new Error('COUPON_TICKET_INVALID');

  const expected = createHmac('sha256', secret()).update(body).digest();
  const actual = fromB64url(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('COUPON_TICKET_INVALID');
  }

  let payload: CouponTicketPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    throw new Error('COUPON_TICKET_INVALID');
  }

  if (!payload?.code || !payload.userId || !payload.scope) throw new Error('COUPON_TICKET_INVALID');
  if (payload.exp < Date.now()) throw new Error('COUPON_TICKET_EXPIRED');
  if (payload.userId !== expect.userId) throw new Error('COUPON_TICKET_INVALID');
  if (payload.scope !== expect.scope) throw new Error('COUPON_SCOPE');
  // amount must match within 0.01
  if (Math.abs(Number(payload.amountCny) - Number(expect.amountCny)) > 0.001) {
    throw new Error('COUPON_TICKET_AMOUNT_MISMATCH');
  }

  return { code: String(payload.code).trim().toUpperCase() };
}
