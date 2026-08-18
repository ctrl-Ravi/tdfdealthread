import { reddit, redis, scheduler, media, RichTextBuilder } from '@devvit/web/server';
import { formatFriendlyDate, formatFriendlyTime } from './date.ts';
import type { QueuedDeal } from './storage.ts';
import { getDailyDeals } from './storage.ts';

/**
 * DEVELOPMENT CONFIGURATION
 * Set this to 5 for production.
 */
export const MEGATHREAD_THRESHOLD = 5;

export async function getMegathreadId(subreddit: string, dateStr: string): Promise<string | undefined> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  return await redis.get(`subreddit:${safeSub}:megathread:${dateStr}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === 'test' ? 0 : ms));

export async function setMegathreadId(subreddit: string, dateStr: string, postId: string): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  await redis.set(`subreddit:${safeSub}:megathread:${dateStr}`, postId);
  await redis.expire(`subreddit:${safeSub}:megathread:${dateStr}`, 30 * 24 * 60 * 60);
}

export async function getRecreateMode(subreddit: string, dateStr: string): Promise<'none' | 'next-deal' | 'manual'> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  const val = await redis.get(`subreddit:${safeSub}:megathread:${dateStr}:recreateMode`);
  return (val as 'none' | 'next-deal' | 'manual') || 'none';
}

export async function setRecreateMode(subreddit: string, dateStr: string, mode: 'none' | 'next-deal' | 'manual'): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  await redis.set(`subreddit:${safeSub}:megathread:${dateStr}:recreateMode`, mode);
  await redis.expire(`subreddit:${safeSub}:megathread:${dateStr}:recreateMode`, 30 * 24 * 60 * 60);
}

export async function getDealCommentState(subreddit: string, dateStr: string, megathreadId: string, postId: string) {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  const key = `subreddit:${safeSub}:megathread:${dateStr}:thread:${megathreadId}:deal:${postId}`;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data);
}

export async function setDealCommentState(subreddit: string, dateStr: string, megathreadId: string, postId: string, state: any) {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  const key = `subreddit:${safeSub}:megathread:${dateStr}:thread:${megathreadId}:deal:${postId}`;
  await redis.set(key, JSON.stringify(state));
  await redis.expire(key, 30 * 24 * 60 * 60);
}

export async function isDealCommentCreated(subreddit: string, dateStr: string, megathreadId: string, postId: string): Promise<boolean> {
  const state = await getDealCommentState(subreddit, dateStr, megathreadId, postId);
  // Only treat a comment as "already created" if it is currently published.
  // deleted, deleted-externally, and deleted-source-unavailable states must NOT
  // block re-processing — they require manual restore or will be skipped by their own logic.
  return !!state && state.status === 'published';
}

export async function markDealCommentCreated(subreddit: string, dateStr: string, megathreadId: string, postId: string, commentId: string): Promise<void> {
  await setDealCommentState(subreddit, dateStr, megathreadId, postId, {
    postId,
    megathreadId,
    commentId,
    status: 'published'
  });
}

export async function clearMegathreadId(subreddit: string, dateStr: string): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  await redis.del(`subreddit:${safeSub}:megathread:${dateStr}`);
}

export function buildMegathreadTitle(friendlyDate: string, dateStr: string): string {
  const templates = [
    "🛍️ Today’s Best Deals, Discounts & Offers | {DATE} | Megathread",
    "💰 Best Deals & Offers Today | {DATE} | Megathread",
    "⚡ Today’s Top Deals & Price Drops | {DATE} | Megathread",
    "🛒 Best Online Shopping Deals | {DATE} | Megathread",
    "💸 Today’s Discounts, Coupons & Deals | {DATE} | Megathread",
    "👀 Best Online Deals & Offers Today | {DATE} | Megathread",
    "🚨 Top Deals & Price Drops Today | {DATE} | Megathread",
    "🏷️ Today’s Best Discounts & Shopping Deals | {DATE} | Megathread"
  ];
  const dd = parseInt(dateStr.split('-')[2] || '1', 10);
  const idx = isNaN(dd) ? 0 : Math.abs(dd - 1) % templates.length;
  return (templates[idx] ?? templates[0] ?? '').replace('{DATE}', friendlyDate);
}

export function buildMegathreadBody(subredditName: string, friendlyDate: string, dealCount: number, lastUpdateDate: Date): string {
  // formatFriendlyTime returns e.g. '11:01 AM IST'
  return `🗂️ **TODAY'S DEAL COLLECTION**\n\nWelcome to the **${subredditName} Daily Deals** thread.\n\nEvery deal posted by ${subredditName} on **${friendlyDate}** will be collected and archived in the comments below, giving you one place to browse all of today's deals.\n\n🛍️ **${dealCount} deals archived so far**\n\n🕐 **Last updated: ${formatFriendlyTime(lastUpdateDate)}**\n\n👇 **Check the comments for the complete deal archive.**\n\n🔄 **New deals will be added throughout the day.**`;
}

export function formatDealComment(deal: QueuedDeal): string {
  const title = deal.title || 'Untitled Deal';
  const bodyPart = deal.body ? `\n\n${deal.body}` : '';

  const imagePart = deal.imageUrl ? `\n\n🖼️ [View Deal Image](${deal.imageUrl})` : '';

  const flair = deal.flair?.trim();
  const flairPart = flair ? `\n\n🏷️ Flair: ${flair}` : '';

  const dealTime = deal.createdAt ? formatFriendlyTime(new Date(deal.createdAt)) : formatFriendlyTime(new Date());

  const permalink = deal.permalink
    ? (deal.permalink.startsWith('http') ? deal.permalink : `https://www.reddit.com${deal.permalink}`)
    : '';

  const permalinkPart = permalink ? `\n\n🔗 Original Reddit Post:\n${permalink}` : '';

  return `${title}${imagePart}${bodyPart}${flairPart}\n\n🕐 ${dealTime}${permalinkPart}`;
}

function parseTextWithStyles(c: any, raw: string) {
  let text = '';
  const formatting: any[] = [];
  const tokenRegex = /(\*\*|__|\*|_)/g;
  let match;
  let lastIndex = 0;

  let boldStart = -1;
  let italicStart = -1;

  while ((match = tokenRegex.exec(raw)) !== null) {
    text += raw.substring(lastIndex, match.index);
    const marker = match[1];

    // Devvit RichText format API expects Unicode Code Point indices, 
    // NOT UTF-16 code units (which is what text.length returns in JS).
    // [...text].length counts code points accurately, handling emojis properly.
    const currentCodePointIndex = [...text].length;

    if (marker === '**' || marker === '__') {
      if (boldStart !== -1) {
        formatting.push([1, boldStart, currentCodePointIndex - boldStart]);
        boldStart = -1;
      } else {
        boldStart = currentCodePointIndex;
      }
    } else {
      if (italicStart !== -1) {
        formatting.push([2, italicStart, currentCodePointIndex - italicStart]);
        italicStart = -1;
      } else {
        italicStart = currentCodePointIndex;
      }
    }
    lastIndex = tokenRegex.lastIndex;
  }
  text += raw.substring(lastIndex);

  if (text) {
    if (typeof c.text === 'function') {
      c.text({ text, formatting: formatting.length > 0 ? formatting : undefined });
    } else if (typeof c.rawText === 'function') {
      c.rawText(text);
    }
  }
}

function parseInline(c: any, text: string) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let lastIndex = 0;
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parseTextWithStyles(c, text.substring(lastIndex, match.index));
    }
    c.link({ url: match[2] || '', text: (match[1] || '').replace(/\*\*|__|\*|_/g, '') });
    lastIndex = linkRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parseTextWithStyles(c, text.substring(lastIndex));
  }
}

function parseMarkdownToRichText(rt: RichTextBuilder, markdown: string) {
  const blocks = markdown.split(/\n{2,}/);
  for (const block of blocks) {
    if (!block.trim()) continue;

    if (block.split('\n').every(line => line.trim().startsWith('* ') || line.trim().startsWith('- '))) {
      rt.list({ ordered: false }, l => {
        for (const line of block.split('\n')) {
          if (!line.trim()) continue;
          l.item(i => {
            i.paragraph(p => {
              parseInline(p, line.trim().replace(/^[\*\-]\s+/, ''));
            });
          });
        }
      });
      continue;
    }

    if (block.split('\n').every(line => /^\d+\.\s+/.test(line.trim()))) {
      rt.list({ ordered: true }, l => {
        for (const line of block.split('\n')) {
          if (!line.trim()) continue;
          l.item(i => {
            i.paragraph(p => {
              parseInline(p, line.trim().replace(/^\d+\.\s+/, ''));
            });
          });
        }
      });
      continue;
    }

    if (block.startsWith('#')) {
      const match = block.match(/^(#{1,6})\s+(.*)/);
      if (match) {
        rt.heading({ level: (match[1] || '#').length as any }, h => {
          parseInline(h, match[2] || '');
        });
        continue;
      }
    }

    rt.paragraph(p => {
      const lines = block.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) p.linebreak();
        parseInline(p, lines[i] || '');
      }
    });
  }
}

export function buildRichTextComment(deal: QueuedDeal, uploadedMediaUrl: string): object {
  const rt = new RichTextBuilder();
  rt.paragraph(c => c.text({ text: deal.title || 'Untitled Deal' }));

  rt.paragraph(c => c.image({ mediaUrl: uploadedMediaUrl }));

  if (deal.body) {
    parseMarkdownToRichText(rt, deal.body);
  }

  const flair = deal.flair?.trim();
  if (flair) {
    rt.paragraph(c => c.text({ text: `🏷️ Flair: ${flair}` }));
  }

  const dealTime = deal.createdAt ? formatFriendlyTime(new Date(deal.createdAt)) : formatFriendlyTime(new Date());
  rt.paragraph(c => c.text({ text: `🕐 Posted: ${dealTime}` }));

  const permalink = deal.permalink
    ? (deal.permalink.startsWith('http') ? deal.permalink : `https://www.reddit.com${deal.permalink}`)
    : '';

  if (permalink) {
    rt.paragraph(c => c.text({ text: `🔗 Original Reddit Post:\n${permalink}` }));
  }

  return rt;
}

export async function ensureDailyMegathread(subreddit: string, dateStr: string, lastDealDate: Date, initialCount: number = MEGATHREAD_THRESHOLD): Promise<string> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  let megathreadId = await getMegathreadId(subreddit, dateStr);
  if (megathreadId) {
    return megathreadId;
  }

  const lockKey = `subreddit:${safeSub}:megathread:${dateStr}:lock`;
  const lock = await redis.set(lockKey, 'locked', { nx: true, expiration: new Date(Date.now() + 15000) });
  if (lock !== 'OK') {
    return '';
  }

  // Double check after acquiring lock
  megathreadId = await getMegathreadId(subreddit, dateStr);
  if (megathreadId) {
    return megathreadId;
  }

  // Construct UTC date from YYYY-MM-DD
  const parts = dateStr.split('-');
  const yyyy = parseInt(parts[0] || '0');
  const mm = parseInt(parts[1] || '1');
  const dd = parseInt(parts[2] || '1');
  const dateObj = new Date(Date.UTC(yyyy, mm - 1, dd));

  const friendlyDate = formatFriendlyDate(dateObj);
  const title = buildMegathreadTitle(friendlyDate, dateStr);
  const text = buildMegathreadBody(subreddit, friendlyDate, initialCount, lastDealDate);

  const todayImageMedia = await redis.get(`subreddit:${safeSub}:megathread:${dateStr}:image`);
  const defaultImageMedia = await redis.get(`subreddit:${safeSub}:megathread:default-image-media`);
  const selectedImageMedia = todayImageMedia || defaultImageMedia;

  let post;
  if (selectedImageMedia) {
    const rt = new RichTextBuilder();
    rt.image({ mediaUrl: selectedImageMedia });
    parseMarkdownToRichText(rt, text);
    post = await reddit.submitPost({
      subredditName: subreddit,
      title,
      richtext: rt.build() as any
    });
    // Note: We deliberately do NOT write defaultImageMedia to the today:image Redis key here.
    // today:image is strictly reserved for explicit moderator custom image overrides.
  } else {
    post = await reddit.submitPost({
      subredditName: subreddit,
      title,
      text
    });
  }

  megathreadId = post.id;
  await setMegathreadId(subreddit, dateStr, megathreadId);
  return megathreadId;
}

export async function updateMegathreadBody(subreddit: string, dateStr: string, megathreadId: string, dailyDealCount: number, latestDealTime: Date): Promise<void> {
  const parts = dateStr.split('-');
  const yyyy = parseInt(parts[0] || '0');
  const mm = parseInt(parts[1] || '1');
  const dd = parseInt(parts[2] || '1');
  const dateObj = new Date(Date.UTC(yyyy, mm - 1, dd));

  const friendlyDate = formatFriendlyDate(dateObj);
  const text = buildMegathreadBody(subreddit, friendlyDate, dailyDealCount, latestDealTime);

  const post = await reddit.getPostById(megathreadId as any);

  // Check image priority (Today's -> Default -> Text-only)
  const safeSub = (subreddit || 'unknown').toLowerCase();
  const todayImageMedia = await redis.get(`subreddit:${safeSub}:megathread:${dateStr}:image`);
  const defaultImageMedia = await redis.get(`subreddit:${safeSub}:megathread:default-image-media`);
  const selectedImageMedia = todayImageMedia || defaultImageMedia;

  if (selectedImageMedia) {
    const rt = new RichTextBuilder();
    rt.image({ mediaUrl: selectedImageMedia });
    parseMarkdownToRichText(rt, text);
    await post.edit({ richtext: rt.build() } as any);
  } else {
    await post.edit({ text });
  }
}

export async function updateMegathreadImage(subreddit: string, dateStr: string, megathreadId: string | null | undefined, imageUrl: string): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  await redis.set(`subreddit:${safeSub}:megathread:${dateStr}:image`, imageUrl);
  await redis.expire(`subreddit:${safeSub}:megathread:${dateStr}:image`, 30 * 24 * 60 * 60);

  if (megathreadId) {
    const post = await reddit.getPostById(megathreadId as any);
    const rawBody = post.body || '';
    const cleanBody = rawBody.replace(/!\[.*?\]\(.*?\)\n*/g, '').trim();
    const rt = new RichTextBuilder();
    rt.image({ mediaUrl: imageUrl });
    parseMarkdownToRichText(rt, cleanBody);
    await post.edit({ richtext: rt.build() } as any);
  }
}

export async function removeTodayMegathreadImage(subreddit: string, dateStr: string, megathreadId?: string | null): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  await redis.del(`subreddit:${safeSub}:megathread:${dateStr}:image`);
  if (megathreadId) {
    const post = await reddit.getPostById(megathreadId as any);
    const rawBody = post.body || '';
    const cleanBody = rawBody.replace(/!\[.*?\]\(.*?\)\n*/g, '').trim();
    const defaultImageMedia = await redis.get(`subreddit:${safeSub}:megathread:default-image-media`);
    if (defaultImageMedia) {
      const rt = new RichTextBuilder();
      rt.image({ mediaUrl: defaultImageMedia });
      parseMarkdownToRichText(rt, cleanBody);
      await post.edit({ richtext: rt.build() } as any);
    } else {
      await post.edit({ text: cleanBody });
    }
  }
}

export async function populateInitialMegathread(subreddit: string, dateStr: string, megathreadId: string, queueKey: string): Promise<boolean> {
  const deals = await getDailyDeals(queueKey);

  // Ensure chronological order
  deals.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const startTime = Date.now();
  let isFirst = true;
  let hasPending = false;

  const safeSub = (subreddit || 'unknown').toLowerCase();
  const cutoffStr = await redis.get(`subreddit:${safeSub}:megathread:${dateStr}:nextDealCutoff`);
  const cutoff = cutoffStr ? parseInt(cutoffStr) : 0;

  for (const deal of deals) {
    if (Date.now() - startTime > 20000) {
      console.warn(`[TDFDealThread] Execution time limit approaching. Resuming later.`);
      return true;
    }

    const isCreated = await isDealCommentCreated(subreddit, dateStr, megathreadId, deal.postId);
    if (!isCreated) {
      if (deal.pendingReason === 'awaiting-new-thread' || deal.pendingReason === 'failed-publish' || (cutoff && deal.queuedAt && deal.queuedAt <= cutoff)) {
        continue;
      }

      // Scoped to subreddit to prevent cross-subreddit failure counter bleed
      const failKey = `subreddit:${safeSub}:megathread:fails:${deal.postId}`;
      const fails = parseInt(await redis.get(failKey) || '0');

      if (fails >= 3) {
        console.warn(`[TDFDealThread] Deal ${deal.postId} has failed ${fails} times. Skipping as permanently failed.`);
        continue; // Do NOT set hasPending=true so we don't infinitely retry this deal
      }

      const dealLockKey = `subreddit:${safeSub}:megathread:${dateStr}:deal:${deal.postId}:lock`;
      const acquired = await redis.set(dealLockKey, 'locked', { nx: true, expiration: new Date(Date.now() + 60000) });
      if (acquired !== 'OK') {
        continue;
      }

      if (!isFirst) {
        await sleep(5500);
      }
      isFirst = false;

      let commentPayload: any = { id: megathreadId as any, text: formatDealComment(deal) };

      if (deal.imageUrl) {
        try {
          const uploaded = await media.upload({ url: deal.imageUrl, type: 'image' });
          if (uploaded && uploaded.mediaUrl) {
            commentPayload = { id: megathreadId as any, richtext: buildRichTextComment(deal, uploaded.mediaUrl) };
          }
        } catch (uploadError: any) {
          console.warn(`[TDFDealThread] Failed to upload media for deal ${deal.postId}, falling back to text. Error:`, uploadError?.message || String(uploadError), 'URL:', deal.imageUrl, 'Type:', typeof deal.imageUrl, 'Length:', deal.imageUrl?.length);
        }
      }

      try {
        const comment = await reddit.submitComment(commentPayload);
        await markDealCommentCreated(subreddit, dateStr, megathreadId, deal.postId, comment.id);
      } catch (error: any) {
        console.error(`[TDFDealThread] Failed to create comment for deal ${deal.postId}:`, error);

        if (error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('RatelimitError') || error?.message?.includes('429')) {
          console.warn(`[TDFDealThread] Rate limit hit. Resuming later.`);
          hasPending = true;
          return true;
        }

        hasPending = true; // Remains pending for now
        await redis.set(failKey, (fails + 1).toString(), { expiration: new Date(Date.now() + 86400000 * 7) });
        console.warn(`[TDFDealThread] Unexpected error for deal ${deal.postId}. Proceeding to next deal.`);
      }
    }
  }

  return hasPending;
}

export async function schedulePopulateComments(subreddit: string, dateStr: string, megathreadId: string, queueKey: string, resetRetry: boolean = false): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();

  // Note: We no longer track jobRetry limit, we now track per-comment failure limits natively.

  const lockKey = `subreddit:${safeSub}:megathread:${dateStr}:jobLock`;

  const existingJob = await redis.get(lockKey);
  if (existingJob) {
    return; // Already scheduled
  }

  const jobId = await scheduler.runJob({
    name: 'populateComments',
    data: { subreddit, dateStr, megathreadId, dateKey: queueKey },
    runAt: new Date(Date.now() + 5000)
  });

  // Expire in 60s as a safety net in case the job never executes
  await redis.set(lockKey, jobId, { expiration: new Date(Date.now() + 60000) });
}

export async function clearPopulateCommentsLock(subreddit: string, dateStr: string): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  const lockKey = `subreddit:${safeSub}:megathread:${dateStr}:jobLock`;
  await redis.del(lockKey);
}
