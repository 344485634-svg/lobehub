import type { ReferralStatusString } from '@lobechat/types';
import { Plans } from '@lobechat/types';

import { SubscriptionModel } from '@/database/models/subscription';
import { getServerDB } from '@/database/server';

export interface OnUserActivityForBusinessParams {
  currentTime: Date;
  previousLastActiveAt: Date;
  userCreatedAt: Date;
  userId: string;
}

export async function getReferralStatus(
  _userId: string,
): Promise<ReferralStatusString | undefined> {
  return undefined;
}

export async function getSubscriptionPlan(userId: string): Promise<Plans> {
  try {
    const db = await getServerDB();
    const sub = await new SubscriptionModel(db, userId).getCurrentSubscription();
    if (!sub) return Plans.Free;
    if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) return Plans.Free;
    return Plans.Hobby;
  } catch {
    return Plans.Free;
  }
}

export async function initNewUserForBusiness(
  _userId: string,
  _createdAt: Date | null | undefined,
): Promise<void> {}

export async function onUserActivityForBusiness(
  _params: OnUserActivityForBusinessParams,
): Promise<void> {}
