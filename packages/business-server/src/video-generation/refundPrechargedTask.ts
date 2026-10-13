import { and, eq, sql } from 'drizzle-orm';

import { asyncTasks } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { refundCredits } from '../credits/deductCredits';

/**
 * Refund a failed task's precharge exactly once.
 *
 * The DB-side timeout check (checkTimeoutTasks) can fail a task outside the
 * async route's error path, which is where refunds used to live exclusively —
 * timed-out tasks silently kept the precharge. Both paths route through here;
 * the claim is an atomic conditional update of a metadata flag so concurrent
 * callers can't double-refund. Returns true when this call performed the refund.
 */
export async function refundPrechargedTaskOnce(
  db: LobeChatDatabase,
  userId: string,
  task: { id: string; metadata?: unknown },
): Promise<boolean> {
  const metadata = (task.metadata || {}) as Record<string, any>;
  const amount = Number(metadata?.precharge?.amount) || 0;
  if (!metadata?.precharge || amount <= 0) return false;

  const claimed = await db
    .update(asyncTasks)
    .set({
      metadata: sql`${asyncTasks.metadata} || ${JSON.stringify({ prechargeRefunded: true })}::jsonb`,
    })
    .where(
      and(eq(asyncTasks.id, task.id), sql`${asyncTasks.metadata}->>'prechargeRefunded' is null`),
    )
    .returning({ id: asyncTasks.id });

  if (claimed.length === 0) return false;

  await refundCredits(db, userId, amount);
  return true;
}
