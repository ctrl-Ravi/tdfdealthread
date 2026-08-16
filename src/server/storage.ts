import { redis } from '@devvit/web/server';

export interface QueuedDeal {
  postId: string;
  subreddit: string;
  title?: string;
  body?: string;
  url?: string;
  permalink?: string;
  createdAt?: number;
  retailer: string;
  detectionMethod: 'domain' | 'keyword';
  matchedValue: string;
  flair?: string;
  imageUrl?: string;
  pendingReason?: 'awaiting-new-thread' | 'failed-publish' | 'new-deal';
  queuedAt?: number;
};

export async function isProcessed(subreddit: string, postId: string): Promise<string | null> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  const key = `subreddit:${safeSub}:processed:${postId}`;
  let value = await redis.get(key);
  
  if (!value) {
    // Fallback to old global key for backwards compatibility on deduplication
    value = await redis.get(`processed:${postId}`);
  }
  return value ? value : null;
}

export async function markProcessed(subreddit: string, postId: string, dateStr: string): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  const key = `subreddit:${safeSub}:processed:${postId}`;
  await redis.set(key, dateStr);
  await redis.expire(key, 30 * 24 * 60 * 60);
}

export async function getDailyDeals(dateKey: string): Promise<QueuedDeal[]> {
  try {
    const data = await redis.get(dateKey);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`Failed to parse daily deals for ${dateKey}`, error);
    return [];
  }
}

export async function getDailyDealCount(dateKey: string): Promise<number> {
  const deals = await getDailyDeals(dateKey);
  return deals.length;
}

export async function clearDailyDeals(dateKey: string): Promise<void> {
  await redis.del(dateKey);
}

export async function addDailyDeal(dateKey: string, deal: QueuedDeal): Promise<number> {
  // Max retries to prevent infinite loops in case of heavy contention or unexpected errors
  for (let i = 0; i < 5; i++) {
    const txn = await redis.watch(dateKey);
    let queue: QueuedDeal[] = [];
    
    try {
      const data = await redis.get(dateKey);
      if (data) {
        queue = JSON.parse(data);
      }
    } catch (e) {
      // Ignore JSON parse errors
    }

    if (queue.some(d => d.postId === deal.postId)) {
      await txn.unwatch();
      return queue.length;
    }

    deal.queuedAt = deal.queuedAt || Date.now();
    queue.push(deal);
    await txn.multi();
    await txn.set(dateKey, JSON.stringify(queue));
    if (queue.length === 1) {
      await txn.expire(dateKey, 3 * 24 * 60 * 60);
    }
    
    try {
      await txn.exec();
      return queue.length;
    } catch (error) {
      // exec throws if watched key was modified
      continue;
    }
  }
  
  throw new Error(`[addDailyDeal] Failed to safely add deal after 5 retries due to race conditions.`);
}

export async function scrubDailyDealContent(dateKey: string, postId: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const txn = await redis.watch(dateKey);
    let queue: QueuedDeal[] = [];
    
    try {
      const data = await redis.get(dateKey);
      if (data) {
        queue = JSON.parse(data);
      }
    } catch (e) {
      await txn.unwatch();
      return;
    }

    const dealIndex = queue.findIndex(d => d.postId === postId);
    if (dealIndex === -1) {
      await txn.unwatch();
      return;
    }

    const targetDeal = queue[dealIndex];
    if (targetDeal) {
      delete targetDeal.title;
      delete targetDeal.body;
      delete targetDeal.imageUrl;
      delete targetDeal.flair;
      delete targetDeal.permalink;
    }

    await txn.multi();
    await txn.set(dateKey, JSON.stringify(queue));
    
    try {
      await txn.exec();
      return;
    } catch (error) {
      continue;
    }
  }
  throw new Error(`[scrubDailyDealContent] Failed to safely scrub deal after 5 retries due to race conditions.`);
}
