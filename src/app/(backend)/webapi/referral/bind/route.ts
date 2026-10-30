import { NextResponse } from 'next/server';
import { z } from 'zod';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import { ReferralModel } from '@/database/models/creditReferral';

export const POST = checkAuth(async (req: Request, { userId, serverDB }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = z.object({ code: z.string().min(2).max(16) }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid code' }, { status: 400 });
    }

    const model = new ReferralModel(serverDB, userId);
    await model.bindInviteCode(parsed.data.code);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    const msg = e?.message;
    if (msg === 'ALREADY_BOUND') return NextResponse.json({ alreadyBound: true });
    if (msg === 'INVALID_CODE') return NextResponse.json({ error: 'invalid code' }, { status: 400 });
    if (msg === 'SELF_REFERRAL') return NextResponse.json({ error: 'self referral' }, { status: 400 });
    return NextResponse.json({ error: msg || 'bind failed' }, { status: 500 });
  }
});
