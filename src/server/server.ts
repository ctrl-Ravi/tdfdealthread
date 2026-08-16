import { once } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { context, reddit, scheduler, redis } from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
} from '../shared/api.ts'
import { detectRetailer } from './detection.ts'
import { getDailyQueueKey, getTodayBounds } from './date.ts'
import { isProcessed, markProcessed, addDailyDeal, getDailyDeals, scrubDailyDealContent, type QueuedDeal } from './storage.ts'
import { ensureDailyMegathread, populateInitialMegathread, getMegathreadId, MEGATHREAD_THRESHOLD, updateMegathreadBody, schedulePopulateComments, clearPopulateCommentsLock, clearMegathreadId, updateMegathreadImage, removeTodayMegathreadImage, getRecreateMode, setRecreateMode, getDealCommentState, setDealCommentState, buildRichTextComment, formatDealComment } from './megathread.ts'
import type { PostSubmit, AppInstall, PostDelete } from '@devvit/protos/types/devvit/events/v1alpha/events.js'
import { media } from '@devvit/web/server'
import { formatFriendlyTime, getISTParts, getDateString } from './date.ts'

/**
 * Default Megathread banner image applied to every NEW subreddit installation.
 * Only written if no moderator-configured default already exists.
 * Moderators can change or remove it at any time from the management UI.
 */
const DEFAULT_MEGATHREAD_IMAGE_URL = 'https://raw.githubusercontent.com/ctrl-Ravi/images/main/defaultimage.png'

async function initializeDefaultImage(subreddit: string): Promise<void> {
  const safeSub = (subreddit || 'unknown').toLowerCase()
  const imageKey = `subreddit:${safeSub}:megathread:default-image`
  const mediaKey = `subreddit:${safeSub}:megathread:default-image-media`

  // Idempotent: only initialize if no default has been configured yet
  const existing = await redis.get(imageKey)
  if (existing) {
    console.log(`[TDFDealThread] Default image already configured for ${subreddit}, skipping initialization.`)
    return
  }

  try {
    const uploaded = await media.upload({ url: DEFAULT_MEGATHREAD_IMAGE_URL, type: 'image' })
    if (!uploaded || !uploaded.mediaUrl) {
      console.warn(`[TDFDealThread] Default image upload returned no mediaUrl for ${subreddit}. Skipping.`)
      return
    }
    await redis.set(imageKey, DEFAULT_MEGATHREAD_IMAGE_URL)
    await redis.set(mediaKey, uploaded.mediaUrl)
    console.log(`[TDFDealThread] Default Megathread image initialized for ${subreddit}: ${uploaded.mediaUrl}`)
  } catch (err) {
    // Do not leave a partial configuration: neither key is written on failure
    console.warn(`[TDFDealThread] Failed to initialize default image for ${subreddit}:`, err)
  }
}

function extractImageUrl(post: any): string | undefined {
  if (post.isImage && post.url && typeof post.url === 'string') {
    return post.url;
  }
  if (post.galleryImages && Array.isArray(post.galleryImages) && post.galleryImages.length > 0) {
    return post.galleryImages[0];
  }
  if (post.gallery && Array.isArray(post.gallery) && post.gallery.length > 0) {
    return post.gallery[0]?.url;
  }
  if (post.url && typeof post.url === 'string') {
    const u = post.url.toLowerCase();
    if (u.match(/\.(jpg|jpeg|png|gif|webp)$/i) || u.includes('i.redd.it') || u.includes('preview.redd.it')) {
      return post.url;
    }
  }
  return undefined;
}

type AnyRsp =
  | UiResponse
  | TriggerResponse
  | ErrorRsp

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err: any) {
    const status = err.status || 500
    const msg = status === 403 ? err.message : (endpointIsManageLoad(reqMsg) ? "management-load-failed" : err.message || `server error`)
    console.error(`server error; ${err instanceof Error ? err.stack : err}`)
    writeJson<ErrorRsp>(status, { error: msg, status }, rspMsg)
  }
}

function endpointIsManageLoad(reqMsg: IncomingMessage) {
  return reqMsg.url === '/api/manage';
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = { error: 'not found', status: 404 }
  } else {
    switch (endpoint) {
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall(reqMsg)
        break
      case Endpoint.OnPostSubmit:
        rsp = await routePostSubmit(reqMsg)
        break
      case Endpoint.OnPostDelete:
        rsp = await routeOnPostDelete(reqMsg)
        break
      case Endpoint.PopulateCommentsJob:
        rsp = await routePopulateCommentsJob(reqMsg)
        break
      case Endpoint.OnMenuManage:
        rsp = await routeMenuManage()
        break
      case Endpoint.ManageGet:
        rsp = await routeManageGet()
        break
      case Endpoint.ManageRefresh:
        rsp = await routeManageRefresh(reqMsg)
        break
      case Endpoint.ManageEdit:
        rsp = await routeManageEdit(reqMsg)
        break
      case Endpoint.ManageImage:
        rsp = await routeManageImage(reqMsg)
        break
      case Endpoint.ManageDelete:
        rsp = await routeManageDelete(reqMsg)
        break
      case Endpoint.ManageCreate:
        rsp = await routeManageCreate(reqMsg)
        break
      case Endpoint.ManageCommentEdit:
        rsp = await routeManageCommentEdit(reqMsg)
        break
      case Endpoint.ManageCommentDelete:
        rsp = await routeManageCommentDelete(reqMsg)
        break
      case Endpoint.ManageCommentRestore:
        rsp = await routeManageCommentRestore(reqMsg)
        break
      case Endpoint.ManageCommentPublishPending:
        rsp = await routeManageCommentPublishPending(reqMsg)
        break
      case Endpoint.ManageRecreateMode:
        rsp = await routeManageRecreateMode(reqMsg)
        break
      case Endpoint.ManageSetDefaultImage:
        rsp = await routeManageSetDefaultImage(reqMsg)
        break

      default:
        endpoint satisfies never
        rsp = { error: 'not found', status: 404 }
        break
    }
  }

  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

async function routeAppInstall(reqMsg: IncomingMessage): Promise<TriggerResponse> {
  const data = await readJson<AppInstall>(reqMsg)
  const subreddit = data.subreddit?.name

  if (!subreddit) {
    return {}
  }

  // Initialize the default Megathread image for new installations (idempotent, isolated)
  await initializeDefaultImage(subreddit)

  try {
    const { start, end } = getTodayBounds()
    const newPosts = reddit.getNewPosts({ subredditName: subreddit, limit: 100 })

    const todayDeals: any[] = []

    for await (const post of newPosts) {
      const postDate = new Date(post.createdAt)
      if (postDate >= end) {
        continue
      }
      if (postDate < start) {
        break
      }

      const detectionResult = detectRetailer({
        title: post.title,
        body: post.body,
        url: post.url
      })

      if (detectionResult.matched) {
        todayDeals.push({ post, detectionResult })
      }
    }

    todayDeals.reverse() // Sort chronologically oldest -> newest

    const dateKey = getDailyQueueKey(subreddit)

    for (const item of todayDeals) {
      const { post, detectionResult } = item
      const fullPostId = post.id.startsWith('t3_') ? post.id : `t3_${post.id}`
      const processed = await isProcessed(subreddit, fullPostId)

      if (!processed) {
        const deal: QueuedDeal = {
          postId: fullPostId,
          subreddit,
          title: post.title,
          body: post.body,
          url: post.url,
          permalink: post.permalink,
          createdAt: post.createdAt.getTime(),
          retailer: detectionResult.retailer,
          detectionMethod: detectionResult.method,
          matchedValue: detectionResult.matchedValue,
          flair: post.flair?.text,
          imageUrl: extractImageUrl(post)
        }

        await addDailyDeal(dateKey, deal)
        const dateStr = dateKey.split(':').pop() || ''
        await markProcessed(subreddit, fullPostId, dateStr)
      }
    }

    // Idempotent Threshold Evaluation
    const dailyDeals = await getDailyDeals(dateKey)
    const dailyDealCount = dailyDeals.length

    const dateStr = dateKey.split(':').pop() || ''
    const recreateMode = await getRecreateMode(subreddit, dateStr)
    if (recreateMode === 'none' && dailyDealCount >= MEGATHREAD_THRESHOLD) {
      const lastDealDate = new Date(dailyDeals[dailyDealCount - 1]?.createdAt || Date.now())
      const megathreadId = await ensureDailyMegathread(subreddit, dateStr, lastDealDate, dailyDealCount)

      const requiresResume = await populateInitialMegathread(subreddit, dateStr, megathreadId, dateKey)
      if (requiresResume) {
        await schedulePopulateComments(subreddit, dateStr, megathreadId, dateKey, true)
      }
    }

  } catch (err) {
    console.error(`[TDFDealThread] AppInstall backfill failed:`, err)
  }

  return {}
}

async function routePopulateCommentsJob(reqMsg: IncomingMessage): Promise<TriggerResponse> {
  const payload = await readJson<any>(reqMsg)
  const data = payload.data || payload
  const { subreddit, dateStr, megathreadId, dateKey } = data

  if (!subreddit || !dateStr || !megathreadId || !dateKey) {
    return {}
  }

  try {
    const activeMegathreadId = await getMegathreadId(subreddit, dateStr)
    if (activeMegathreadId !== megathreadId) {
      console.warn(`[TDFDealThread] Stale job protection triggered. Job target: ${megathreadId}, Active: ${activeMegathreadId}. Terminating safely.`)
      return {}
    }

    await clearPopulateCommentsLock(subreddit, dateStr)
    const requiresResume = await populateInitialMegathread(subreddit, dateStr, megathreadId, dateKey)
    if (requiresResume) {
      await schedulePopulateComments(subreddit, dateStr, megathreadId, dateKey, false)
    }
  } catch (err) {
    console.error(`[TDFDealThread] populateComments job failed:`, err)
  }

  return {}
}

async function routeOnPostDelete(reqMsg: IncomingMessage): Promise<TriggerResponse> {
  const data = await readJson<PostDelete>(reqMsg)
  if (!data.postId || !data.subreddit) return {}

  const safeSub = data.subreddit.name.toLowerCase()
  const fullPostId = data.postId.startsWith('t3_') ? data.postId : `t3_${data.postId}`

  let dateStr = await isProcessed(safeSub, fullPostId)
  if (dateStr === '1' && data.createdAt) {
    dateStr = getDateString(new Date(data.createdAt))
  } else if (!dateStr || dateStr === '1') {
    console.error(`[TDFDealThread] Cannot process post deletion for ${fullPostId}: missing date mapping.`)
    return {}
  }

  const megathreadId = await getMegathreadId(safeSub, dateStr)
  
  if (megathreadId) {
    const state = await getDealCommentState(safeSub, dateStr, megathreadId, fullPostId)
    if (state && state.status !== 'deleted-source-unavailable') {
      if (state.status === 'published' && state.commentId) {
        try {
          const comment = await reddit.getCommentById(state.commentId)
          await comment.delete()
        } catch (err: any) {
          const msg = err?.message?.toLowerCase() || ''
          const isNotFound = err?.status === 404 || err?.code === 'not_found' || msg.includes('404') || msg.includes('not found')
          if (!isNotFound) {
            console.error(`[TDFDealThread] Temporary API error during post deletion (comment ${state.commentId}):`, err)
            throw err
          }
        }
      }

      await setDealCommentState(safeSub, dateStr, megathreadId, fullPostId, {
        ...state,
        status: 'deleted-source-unavailable'
      })
    }
  }

  const queueKey = `subreddit:${safeSub}:queue:deals:${dateStr}`
  await scrubDailyDealContent(queueKey, fullPostId)

  return {}
}

async function routePostSubmit(reqMsg: IncomingMessage): Promise<TriggerResponse> {
  const data = await readJson<PostSubmit>(reqMsg)

  const postId = data.post?.id
  const subreddit = data.subreddit?.name
  const title = data.post?.title
  const selftext = data.post?.selftext
  const url = data.post?.url
  const permalink = data.post?.permalink
  const createdAt = data.post?.createdAt

  if (!subreddit) {
    return {}
  }

  const detectionResult = detectRetailer({
    title,
    body: selftext,
    url
  })

  if (!detectionResult.matched) {
    console.log(`[TDFDealThread] Post ignored\nreason=no-retailer-match\npostId=t3_${postId}`)
    return {}
  }

  const fullPostId = postId?.startsWith('t3_') ? postId : `t3_${postId}`

  const processed = await isProcessed(subreddit, fullPostId)
  if (processed) {
    console.log(`[TDFDealThread] Post ignored\nreason=already-processed\npostId=${fullPostId}`)
    return {}
  }

  const deal: QueuedDeal = {
    postId: fullPostId,
    subreddit,
    title,
    body: selftext,
    url,
    permalink,
    createdAt,
    retailer: detectionResult.retailer,
    detectionMethod: detectionResult.method,
    matchedValue: detectionResult.matchedValue,
    flair: data.post?.linkFlair?.text,
    imageUrl: extractImageUrl(data.post)
  }

  const dateKey = getDailyQueueKey(subreddit)

  try {
    const dateStr = dateKey.split(':').pop() || ''
    const dailyDealCount = await addDailyDeal(dateKey, deal)
    await markProcessed(subreddit, fullPostId, dateStr)

    const thresholdReached = dailyDealCount === 5

    console.log(`[TDFDealThread] Deal queued
postId=${fullPostId}
retailer=${deal.retailer}
dailyDealCount=${dailyDealCount}
megathreadThresholdReached=${thresholdReached}`)

    const recreateMode = await getRecreateMode(subreddit, dateStr)
    if (dailyDealCount >= MEGATHREAD_THRESHOLD || recreateMode === 'next-deal') {
      let megathreadId = await getMegathreadId(subreddit, dateStr)
      const lastDealDate = new Date(deal.createdAt || Date.now())

      if (!megathreadId) {
        if (recreateMode === 'next-deal' || recreateMode === 'none') {
          await setRecreateMode(subreddit, dateStr, 'none')
          megathreadId = await ensureDailyMegathread(subreddit, dateStr, lastDealDate, dailyDealCount)
        }
      }

      if (megathreadId) {
        await updateMegathreadBody(subreddit, dateStr, megathreadId, dailyDealCount, lastDealDate)
        const requiresResume = await populateInitialMegathread(subreddit, dateStr, megathreadId, dateKey)
        if (requiresResume) {
          await schedulePopulateComments(subreddit, dateStr, megathreadId, dateKey, true)
        }
      }
    }
  } catch (error) {
    console.error(`[TDFDealThread] Failed to process deal ${fullPostId}:`, error)
  }

  return {}
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
  await once(reqMsg, 'end')
  return JSON.parse(`${Buffer.concat(chunks)}`)
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}

async function verifyModerator(): Promise<{ subreddit: string, user: string }> {
  const subreddit = await reddit.getCurrentSubreddit();
  const user = await reddit.getCurrentUser();
  if (!user || !subreddit) {
    const err: any = new Error("Missing user or subreddit context");
    err.status = 403;
    throw err;
  }

  const perms = await user.getModPermissionsForSubreddit(subreddit.name);
  if (!perms || perms.length === 0) {
    const err: any = new Error("moderator-required");
    err.status = 403;
    throw err;
  }

  return { subreddit: subreddit.name, user: user.username };
}

async function routeMenuManage(): Promise<UiResponse> {
  try {
    const { subreddit } = await verifyModerator();
    const p = getISTParts();
    const dateTitle = `${p.month}/${p.day}`;
    const post = await reddit.submitCustomPost({
      title: `🛠️ TDFDealThread Management - ${dateTitle}`,
      subredditName: subreddit,
      entry: 'manage'
    });
    return {
      showToast: { text: `Management UI opened.`, appearance: 'success' },
      navigateTo: post.url,
    };
  } catch (err: any) {
    return { showToast: { text: err.message } };
  }
}

async function routeManageGet(): Promise<any> {
  console.log('[TDFDealThread Management] GET request received');
  try {
    const { subreddit, user } = await verifyModerator();
    console.log(`[TDFDealThread Management] Mod verified. sub=${subreddit} user=${user}`);

    const dateStr = getDateString(new Date());
    const dateKey = getDailyQueueKey(subreddit, new Date());
    const megathreadId = await getMegathreadId(subreddit, dateStr);
    const safeSub = (subreddit || 'unknown').toLowerCase();
    const defaultImageUrl = await redis.get(`subreddit:${safeSub}:megathread:default-image`);
    const todayImageUrl = await redis.get(`subreddit:${safeSub}:megathread:${dateStr}:image`);
    const recreateMode = await getRecreateMode(subreddit, dateStr);

    console.log(`[TDFDealThread Management] megathread Redis key: subreddit:${subreddit}:megathread:${dateStr}`);
    console.log(`[TDFDealThread Management] megathreadId retrieved from Redis: ${megathreadId}`);

    if (!megathreadId) {
      const deals = await getDailyDeals(dateKey);
      return { exists: false, queueCount: deals.length, recreateMode, defaultImageUrl, todayImageUrl };
    }

    const post = await reddit.getPostById(megathreadId as any);
    const deals = await getDailyDeals(dateKey);
    const cutoffStr = await redis.get(`subreddit:${safeSub}:megathread:${dateStr}:nextDealCutoff`);
    const cutoff = cutoffStr ? parseInt(cutoffStr) : 0;

    // Assemble deal comments
    const commentList = [];
    for (const deal of deals) {
      const state = await getDealCommentState(subreddit, dateStr, megathreadId, deal.postId);
      let status = 'pending';
      let commentId = null;
      let body = '';
      if (state) {
        status = state.status;
        commentId = state.commentId;
        if (status === 'published' && commentId) {
          try {
            const comment = await reddit.getCommentById(commentId);
            body = comment.body || '';
          } catch (e) {
            // comment might be deleted manually
            body = '';
          }
        }
      }
      let pendingReason = deal.pendingReason;
      if (status === 'pending' && !pendingReason) {
        if (cutoff && deal.queuedAt && deal.queuedAt <= cutoff) {
          pendingReason = 'awaiting-new-thread';
        } else {
          pendingReason = 'new-deal';
        }
      }

      commentList.push({
        dealId: deal.postId,
        title: deal.title,
        status,
        commentId,
        body,
        pendingReason,
        createdAt: deal.createdAt,
        url: deal.url
      });
    }

    return {
      exists: true,
      dealCount: deals.length,
      lastUpdated: formatFriendlyTime(new Date()),
      title: post.title,
      body: post.body,
      comments: commentList,
      deals: commentList,
      defaultImageUrl,
      todayImageUrl,
      recreateMode
    };
  } catch (err: any) {
    console.error(`[TDFDealThread Management] GET failed\nerror=${err.message}\nstack=${err.stack}`);
    throw err;
  }
}

async function getManagementContext() {
  const { subreddit } = await verifyModerator();
  const dateStr = getDateString(new Date());
  const megathreadId = await getMegathreadId(subreddit, dateStr);
  const dateKey = getDailyQueueKey(subreddit, new Date());
  return { subreddit, dateStr, megathreadId, dateKey };
}

async function routeManageRefresh(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit, dateStr, megathreadId, dateKey } = await getManagementContext();
  if (!megathreadId) throw new Error("No megathread exists.");
  const requiresResume = await populateInitialMegathread(subreddit, dateStr, megathreadId, dateKey);
  if (requiresResume) {
    await schedulePopulateComments(subreddit, dateStr, megathreadId, dateKey, true);
  }
  return { success: true };
}

async function routeManageCreate(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit, dateStr, megathreadId, dateKey } = await getManagementContext();
  if (megathreadId) {
    // Stale check
    try {
      await reddit.getPostById(megathreadId as any);
      throw new Error("Megathread already exists.");
    } catch (e: any) {
      if (e.message && e.message.includes('not found')) {
        await clearMegathreadId(subreddit, dateStr);
      } else {
        throw new Error("Megathread already exists.");
      }
    }
  }

  const deals = await getDailyDeals(dateKey);
  const newMegathreadId = await ensureDailyMegathread(subreddit, dateStr, new Date(), deals.length);
  const requiresResume = await populateInitialMegathread(subreddit, dateStr, newMegathreadId, dateKey);
  if (requiresResume) {
    await schedulePopulateComments(subreddit, dateStr, newMegathreadId, dateKey, true);
  }
  await setRecreateMode(subreddit, dateStr, 'none');
  return { success: true };
}

async function routeManageEdit(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit, dateStr, megathreadId } = await getManagementContext();
  if (!megathreadId) throw new Error("No megathread exists.");
  const req = await readJson<any>(reqMsg);
  const post = await reddit.getPostById(megathreadId as any);

  // Note: Only the body can be edited using the Devvit API.
  await post.edit({ text: req.body });
  return { success: true };
}

async function routeManageImage(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit, dateStr, megathreadId } = await getManagementContext();
  console.log('ROUTE_MANAGE_IMAGE_CTX:', { subreddit, dateStr, megathreadId });
  const req = await readJson<any>(reqMsg);

  if (req.action === 'remove' || req.remove) {
    await removeTodayMegathreadImage(subreddit, dateStr, megathreadId);
    return { success: true };
  }

  if (!req.imageUrl || !req.imageUrl.startsWith('http')) {
    throw new Error('Invalid image URL');
  }

  const uploaded = await media.upload({ url: req.imageUrl, type: 'image' });
  if (uploaded && uploaded.mediaUrl) {
    await updateMegathreadImage(subreddit, dateStr, megathreadId, uploaded.mediaUrl);
  }
  return { success: true };
}

async function routeManageDelete(reqMsg: IncomingMessage): Promise<any> {
  const payload = await readJson<any>(reqMsg);
  const mode = payload.mode || 'delete-only';

  const { subreddit, dateStr, megathreadId, dateKey } = await getManagementContext();

  if (!megathreadId) throw new Error("No megathread exists.");

  try {
    const post = await reddit.getPostById(megathreadId as any);
    await post.delete();
    await clearMegathreadId(subreddit, dateStr);

    if (mode === 'delete-only') {
      await setRecreateMode(subreddit, dateStr, 'manual');
    } else if (mode === 'next-deal') {
      const safeSub = (subreddit || 'unknown').toLowerCase();
      await setRecreateMode(subreddit, dateStr, 'next-deal');
      await redis.set(`subreddit:${safeSub}:megathread:${dateStr}:nextDealCutoff`, Date.now().toString(), { expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    } else if (mode === 'recreate-now') {
      await setRecreateMode(subreddit, dateStr, 'none');
      const deals = await getDailyDeals(dateKey);
      const newMegathreadId = await ensureDailyMegathread(subreddit, dateStr, new Date(), deals.length);
      const requiresResume = await populateInitialMegathread(subreddit, dateStr, newMegathreadId, dateKey);
      if (requiresResume) {
        await schedulePopulateComments(subreddit, dateStr, newMegathreadId, dateKey, true);
      }
    }
    return { success: true };
  } catch (err: any) {
    throw err;
  }
}

async function routeManageCommentEdit(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit, dateStr, megathreadId, dateKey } = await getManagementContext();
  if (!megathreadId) throw new Error("No megathread exists.");
  const req = await readJson<any>(reqMsg);

  const state = await getDealCommentState(subreddit, dateStr, megathreadId, req.dealId);
  if (!state || state.status !== 'published') throw new Error("Comment not found or not published in this megathread.");

  const comment = await reddit.getCommentById(state.commentId);
  await comment.edit({ text: req.body });
  return { success: true };
}

async function routeManageCommentDelete(reqMsg: IncomingMessage): Promise<any> {
  const req = await readJson<any>(reqMsg);
  const { subreddit, dateStr, megathreadId, dateKey } = await getManagementContext();

  if (!megathreadId) throw new Error("No megathread exists.");

  const state = await getDealCommentState(subreddit, dateStr, megathreadId, req.dealId);
  if (!state || state.status !== 'published') throw new Error("Comment not found or not published in this megathread.");

  let comment;
  try {
    comment = await reddit.getCommentById(state.commentId);
  } catch (err: any) {
    if (err && (err.code === 'not_found' || err.code === 'NOT_FOUND' || err.status === 404)) {
      state.status = 'deleted-externally';
      await setDealCommentState(subreddit, dateStr, megathreadId, req.dealId, state);
      return { success: true, message: 'Comment was already deleted externally.' };
    }
    throw err;
  }

  try {
    await comment.delete();
  } catch (err: any) {
    if (err && (err.code === 'not_found' || err.code === 'NOT_FOUND' || err.status === 404)) {
      state.status = 'deleted-externally';
      await setDealCommentState(subreddit, dateStr, megathreadId, req.dealId, state);
      return { success: true, message: 'Comment was already deleted externally.' };
    }
    throw err;
  }

  state.status = 'deleted';
  await setDealCommentState(subreddit, dateStr, megathreadId, req.dealId, state);
  console.log(`[TDFDealThread CommentDelete SERVER]\nredis state updated to deleted`);
  return { success: true };
}

async function routeManageCommentRestore(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit, dateStr, megathreadId, dateKey } = await getManagementContext();
  if (!megathreadId) throw new Error("No megathread exists.");
  const req = await readJson<any>(reqMsg);

  const state = await getDealCommentState(subreddit, dateStr, megathreadId, req.dealId);
  if (!state || state.status === 'deleted-source-unavailable') {
    throw new Error("Original Reddit post is no longer available. This deal cannot be restored.");
  }
  if (state.status !== 'deleted') {
    throw new Error("Comment not deleted.");
  }
  const deals = await getDailyDeals(dateKey);
  const deal = deals.find(d => d.postId === req.dealId);
  if (!deal) throw new Error("Deal not found in daily queue.");

  try {
    const originalPost = await reddit.getPostById(req.dealId);
    if (!originalPost) throw { code: 'not_found' };
  } catch (e: any) {
    // Only scrub if the API definitively reports a 404/not-found via a reliable property.
    // We cannot rely on e.message string matching as it risks data loss on ambiguous errors.
    if (e && (e.code === 'not_found' || e.code === 'NOT_FOUND' || e.status === 404)) {
      await scrubDailyDealContent(dateKey, req.dealId);
      await setDealCommentState(subreddit, dateStr, megathreadId, req.dealId, {
        postId: req.dealId,
        megathreadId,
        commentId: state.commentId,
        status: 'deleted-source-unavailable'
      });
      throw new Error("Original Reddit post is no longer available. This deal cannot be restored.");
    }
    throw new Error("Restore could not be verified. Please try again.");
  }

  let commentPayload: any = { id: megathreadId as any, text: formatDealComment(deal) };
  if (deal.imageUrl) {
    try {
      const uploaded = await media.upload({ url: deal.imageUrl, type: 'image' });
      if (uploaded && uploaded.mediaUrl) {
        commentPayload = { id: megathreadId as any, richtext: buildRichTextComment(deal, uploaded.mediaUrl) };
      }
    } catch (e) {
      console.warn(`[TDFDealThread] Failed to upload media for restore, falling back to text. Error:`, e);
    }
  }
  const comment = await reddit.submitComment(commentPayload);

  await setDealCommentState(subreddit, dateStr, megathreadId, req.dealId, {
    postId: req.dealId,
    megathreadId,
    commentId: comment.id,
    status: 'published'
  });
  return { success: true };
}

async function routeManageRecreateMode(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit, dateStr } = await getManagementContext();
  const req = await readJson<any>(reqMsg);
  if (['none', 'next-deal', 'manual'].includes(req.mode)) {
    await setRecreateMode(subreddit, dateStr, req.mode);
  }
  return { success: true };
}

async function routeManageCommentPublishPending(reqMsg: IncomingMessage): Promise<any> {
  const payload = await readJson<any>(reqMsg);
  const dealId = payload.dealId;
  const { subreddit, dateStr, megathreadId, dateKey } = await getManagementContext();

  if (!megathreadId) throw new Error("No megathread exists.");

  const deals = await getDailyDeals(dateKey);
  const targetDeal = deals.find(d => d.postId === dealId);
  if (!targetDeal) throw new Error("Deal not found in queue.");

  const state = await getDealCommentState(subreddit, dateStr, megathreadId, dealId);
  if (state && state.status !== 'pending') throw new Error(`Deal is not pending. Current state: ${state.status}`);

  try {
    const originalPost = await reddit.getPostById(dealId);
    if (!originalPost) throw { code: 'not_found' };
  } catch (e: any) {
    if (e && (e.code === 'not_found' || e.code === 'NOT_FOUND' || e.status === 404)) {
      await scrubDailyDealContent(dateKey, dealId);
      await setDealCommentState(subreddit, dateStr, megathreadId, dealId, {
        postId: dealId,
        megathreadId,
        status: 'deleted-source-unavailable'
      });
      throw new Error("Original Reddit post is no longer available. This deal cannot be published.");
    }
    throw new Error("Deal source could not be verified. Please try again.");
  }

  let commentPayload: any = { id: megathreadId as any, text: formatDealComment(targetDeal) };
  if (targetDeal.imageUrl) {
    try {
      const uploaded = await media.upload({ url: targetDeal.imageUrl, type: 'image' });
      if (uploaded && uploaded.mediaUrl) {
        commentPayload = { id: megathreadId as any, richtext: buildRichTextComment(targetDeal, uploaded.mediaUrl) };
      }
    } catch (e) {
      console.warn(`[TDFDealThread] Failed to upload media for pending publish, falling back to text. Error:`, e);
    }
  }

  const comment = await reddit.submitComment(commentPayload);

  await setDealCommentState(subreddit, dateStr, megathreadId, targetDeal.postId, {
    postId: targetDeal.postId,
    megathreadId,
    commentId: comment.id,
    status: 'published'
  });
  return { success: true };
}

async function routeManageSetDefaultImage(reqMsg: IncomingMessage): Promise<any> {
  const { subreddit } = await verifyModerator();
  const req = await readJson<any>(reqMsg);
  const safeSub = (subreddit || 'unknown').toLowerCase();
  
  if (!req.imageUrl || !req.imageUrl.startsWith('http')) {
    throw new Error('Invalid image URL');
  }

  // Attempt to upload to verify and persist it on Devvit Media
  let uploaded;
  try {
    uploaded = await media.upload({ url: req.imageUrl, type: 'image' });
  } catch (e) {
    throw new Error('Failed to upload default image. Previous default remains.');
  }
  
  if (!uploaded || !uploaded.mediaUrl) {
    throw new Error('Failed to upload default image. Previous default remains.');
  }

  // Save the source URL so we can show it in the UI, and the mediaUrl for quick usage
  await redis.set(`subreddit:${safeSub}:megathread:default-image`, req.imageUrl);
  await redis.set(`subreddit:${safeSub}:megathread:default-image-media`, uploaded.mediaUrl);
  return { success: true };
}

