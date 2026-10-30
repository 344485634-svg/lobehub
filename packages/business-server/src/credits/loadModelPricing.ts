import { eq } from 'drizzle-orm';

import { AiModelModel } from '@/database/models/aiModel';
import { users } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import type { ModelCreditPricing } from './types';

/**
 * Load credit pricing for a model. Admin-managed models are stored under the
 * admin user scope, so we try the caller first then known admins.
 */
export async function loadModelCreditPricing(
  db: LobeChatDatabase,
  userId: string,
  providerId: string,
  modelId: string,
): Promise<ModelCreditPricing | null> {
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(8);
    const ownerIds = [userId, ...admins.map((a) => a.id)];

    for (const ownerId of ownerIds) {
      const row = await new AiModelModel(db, ownerId).findByIdAndProvider(modelId, providerId);
      if (row?.pricing && typeof row.pricing === 'object') {
        return row.pricing as ModelCreditPricing;
      }
    }
  } catch {
    return null;
  }
  return null;
}
