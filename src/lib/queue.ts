import { Queue } from 'bullmq';
import redis from './redis';

export const AUDIT_QUEUE_NAME = 'audit';

// NOTE: Do NOT instantiate QueueScheduler or QueueEvents here —
// they open persistent Redis pub/sub connections that burn quota.
declare global {
  // eslint-disable-next-line no-var
  var _auditQueue: Queue | undefined;
}

function createQueue() {
  return new Queue(AUDIT_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });
}

export const auditQueue = globalThis._auditQueue ?? createQueue();
if (process.env.NODE_ENV !== 'production') globalThis._auditQueue = auditQueue;

export async function enqueueAudit(auditId: string) {
  try {
    await auditQueue.add('audit.run', { auditId }, { jobId: auditId });
    console.log(`[queue] enqueued audit.run for auditId=${auditId}`);
  } catch (err) {
    console.error(`[queue] failed to enqueue audit ${auditId}:`, err);
    throw err;
  }
}
