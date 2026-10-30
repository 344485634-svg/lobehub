import { NextResponse } from 'next/server';

import { getServerDB } from '@/database/server';
import { SystemConfigModel } from '@/database/models/systemConfig';

export async function GET() {
  try {
    const db = await getServerDB();
    const model = new SystemConfigModel(db);
    const data = await model.get<{ privacy?: string; terms?: string }>('legal.content');
    return NextResponse.json({ privacy: data?.privacy ?? '', terms: data?.terms ?? '' });
  } catch {
    return NextResponse.json({ privacy: '', terms: '' });
  }
}
