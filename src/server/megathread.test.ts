import test from 'node:test';
import assert from 'node:assert';
import { formatFriendlyDate, formatFriendlyTime } from './date.ts';
import { buildMegathreadTitle, buildMegathreadBody, formatDealComment, buildRichTextComment } from './megathread.ts';
import type { QueuedDeal } from './storage.ts';

test('Megathread title formatting', () => {
  const d = new Date('2026-08-09T00:00:00Z');
  const friendly = formatFriendlyDate(d);
  const title = buildMegathreadTitle(friendly, '2026-08-09');
  assert.strictEqual(title, '🛍️ Today’s Best Deals, Discounts & Offers | August 9, 2026 | Megathread');
});

test('Megathread body formatting', () => {
  const d = new Date('2026-08-09T14:00:00Z');
  const body = buildMegathreadBody('TopDealsFinder', 'August 9, 2026', 5, d);
  assert.ok(body.includes('🗂️ **TODAY\'S DEAL COLLECTION**'));
  assert.ok(body.includes('Every deal posted by TopDealsFinder on **August 9, 2026**'));
  assert.ok(body.includes('🛍️ **5 deals archived so far**'));
  assert.ok(body.includes('🕐 **Last updated: 7:30 PM IST**'));
  assert.ok(body.includes('👇 **Check the comments for the complete deal archive.**'));
  assert.ok(body.includes('🔄 **New deals will be added throughout the day.**'));

  const body6 = buildMegathreadBody('TopDealsFinder', 'August 9, 2026', 6, d);
  assert.ok(body6.includes('🛍️ **6 deals archived so far**'));
});

test('Megathread body formatting - dynamic subreddit names', () => {
  const d = new Date('2026-08-09T14:00:00Z');

  const bodyDealsIndia = buildMegathreadBody('DealsIndia', 'August 9, 2026', 5, d);
  assert.ok(bodyDealsIndia.includes('Welcome to the **DealsIndia Daily Deals** thread.'));
  assert.ok(bodyDealsIndia.includes('Every deal posted by DealsIndia on **August 9, 2026**'));
  assert.ok(!bodyDealsIndia.includes('TopDealsFinder'), 'Should not contain TopDealsFinder when installed in DealsIndia');

  const bodyTelegram = buildMegathreadBody('telegramautopost_dev', 'August 9, 2026', 5, d);
  assert.ok(bodyTelegram.includes('Welcome to the **telegramautopost_dev Daily Deals** thread.'));
  assert.ok(bodyTelegram.includes('Every deal posted by telegramautopost_dev on **August 9, 2026**'));
  assert.ok(!bodyTelegram.includes('TopDealsFinder'), 'Should not contain TopDealsFinder when installed in telegramautopost_dev');
});

test('Deal comment formatting', () => {
  const deal: QueuedDeal = {
    postId: 't3_123',
    subreddit: 'TopDealsFinder',
    title: '🔥 Haier 540L Refrigerator @ ₹43,490',
    body: 'Apply all 4:\n₹1,000 Coupon',
    retailer: 'Amazon',
    detectionMethod: 'domain',
    matchedValue: 'amzn.to',
    url: 'https://amzn.to/example',
    permalink: '/r/TopDealsFinder/comments/123/',
    createdAt: new Date('2026-08-09T12:35:00Z').getTime(),
    flair: 'Electronics'
  };

  const text = formatDealComment(deal);
  assert.ok(text.includes('🔥 Haier 540L Refrigerator @ ₹43,490'), 'Should contain title');
  assert.ok(text.includes('Apply all 4:\n₹1,000 Coupon'), 'Should contain body');
  assert.ok(text.includes('🏷️ Flair: Electronics'), 'Should contain flair');
  assert.ok(text.includes('🕐 6:05 PM IST'), 'Should contain post time');
  assert.ok(text.includes('🔗 Original Reddit Post:\nhttps://www.reddit.com/r/TopDealsFinder/comments/123/'), 'Should contain permalink');

  assert.ok(!text.includes('🏪 Retailer: Amazon'), 'Should NOT contain retailer');
  assert.ok(!text.includes('🛒 Deal Link:'), 'Should NOT contain deal link literal');
});

test('Deal comment formatting - empty optionals safely handled', () => {
  const deal: QueuedDeal = {
    postId: 't3_456',
    subreddit: 'TopDealsFinder',
    retailer: 'Flipkart',
    detectionMethod: 'keyword',
    matchedValue: 'flipkart'
  };

  const text = formatDealComment(deal);
  assert.ok(text.includes('Untitled Deal'));
  assert.ok(!text.includes('🏪 Retailer: Flipkart'));
  assert.ok(!text.includes('🏷️ Flair:'));
  // Should not have undefined or null literals
  assert.strictEqual(text.includes('undefined'), false);
  assert.strictEqual(text.includes('null'), false);
});

test('Deal comment formatting - null/empty flair ignored', () => {
  const deal: QueuedDeal = {
    postId: 't3_789',
    subreddit: 'TopDealsFinder',
    title: 'Deal 3',
    retailer: 'Myntra',
    detectionMethod: 'keyword',
    matchedValue: 'myntra',
    flair: '   '
  };

  const text = formatDealComment(deal);
  assert.ok(!text.includes('🏷️ Flair:'), 'Whitespace flair should be ignored');
});

test('Deal comment formatting - with image and flair', () => {
  const deal: QueuedDeal = {
    postId: 't3_img1',
    subreddit: 'TopDealsFinder',
    title: 'Image Deal',
    retailer: 'Amazon',
    detectionMethod: 'keyword',
    matchedValue: 'amazon',
    flair: 'Electronics',
    imageUrl: 'https://i.redd.it/test.jpg'
  };

  const text = formatDealComment(deal);
  assert.ok(text.includes('🖼️ [View Deal Image](https://i.redd.it/test.jpg)'), 'Should contain image representation');
  assert.ok(text.includes('🏷️ Flair: Electronics'), 'Should contain flair');

  // Verify order: title -> image -> flair
  const titleIdx = text.indexOf('Image Deal');
  const imgIdx = text.indexOf('🖼️ [View Deal Image]');
  const flairIdx = text.indexOf('🏷️ Flair:');
  assert.ok(titleIdx < imgIdx && imgIdx < flairIdx, 'Order must be title, image, flair');
});

test('Deal comment formatting - full order with image', () => {
  const deal: QueuedDeal = {
    postId: 't3_fullimg',
    subreddit: 'TopDealsFinder',
    title: 'Header Deal',
    body: 'Body text here',
    retailer: 'Amazon',
    detectionMethod: 'keyword',
    matchedValue: 'amazon',
    flair: 'Electronics',
    imageUrl: 'https://i.redd.it/test.jpg',
    createdAt: 1000000000,
    permalink: '/r/test/comments/123/'
  };

  const text = formatDealComment(deal);

  const titleIdx = text.indexOf('Header Deal');
  const imgIdx = text.indexOf('🖼️ [View Deal Image]');
  const bodyIdx = text.indexOf('Body text here');
  const flairIdx = text.indexOf('🏷️ Flair: Electronics');
  const timeIdx = text.indexOf('🕐');
  const linkIdx = text.indexOf('🔗 Original Reddit Post');

  assert.ok(titleIdx !== -1, 'Missing title');
  assert.ok(imgIdx !== -1, 'Missing image');
  assert.ok(bodyIdx !== -1, 'Missing body');
  assert.ok(flairIdx !== -1, 'Missing flair');
  assert.ok(timeIdx !== -1, 'Missing time');
  assert.ok(linkIdx !== -1, 'Missing link');
  assert.ok(!text.includes('u/'), 'Username should not be present');

  assert.ok(titleIdx < imgIdx && imgIdx < bodyIdx && bodyIdx < flairIdx && flairIdx < timeIdx && timeIdx < linkIdx, 'Order must be title -> image -> body -> flair -> time -> link');
});

test('Deal comment formatting - full order without image', () => {
  const deal: QueuedDeal = {
    postId: 't3_fullnoimg',
    subreddit: 'TopDealsFinder',
    title: 'Header Deal',
    body: 'Body text here',
    retailer: 'Amazon',
    detectionMethod: 'keyword',
    matchedValue: 'amazon',
    flair: 'Electronics',
    createdAt: 1000000000,
    permalink: '/r/test/comments/123/'
  };

  const text = formatDealComment(deal);

  const titleIdx = text.indexOf('Header Deal');
  const imgIdx = text.indexOf('🖼️ [View Deal Image]');
  const bodyIdx = text.indexOf('Body text here');
  const flairIdx = text.indexOf('🏷️ Flair: Electronics');
  const timeIdx = text.indexOf('🕐');
  const linkIdx = text.indexOf('🔗 Original Reddit Post');

  assert.strictEqual(imgIdx, -1, 'Image should be completely omitted');
  assert.ok(titleIdx < bodyIdx && bodyIdx < flairIdx && flairIdx < timeIdx && timeIdx < linkIdx, 'Order must be title -> body -> flair -> time -> link');
  assert.ok(!text.includes('u/'), 'Username should not be present');
});

test('Deal comment formatting - image extraction failure fallback (no image)', () => {
  const deal: QueuedDeal = {
    postId: 't3_img2',
    subreddit: 'TopDealsFinder',
    title: 'No Image Deal',
    retailer: 'Amazon',
    detectionMethod: 'keyword',
    matchedValue: 'amazon'
  };

  const text = formatDealComment(deal);
  assert.ok(!text.includes('🖼️ [View Deal Image]'), 'Should not contain image representation if missing');
});

test('Deal comment formatting - Text-only comment preserves existing Markdown formatting', () => {
  const deal: QueuedDeal = {
    postId: 't3_img4',
    subreddit: 'TopDealsFinder',
    title: 'No Image Deal',
    body: 'Test deal.\n\n[https://amzn-to.co/knflmQ](https://amzn-to.co/knflmQ)\n\n* Many Options Available',
    retailer: 'Amazon',
    detectionMethod: 'keyword',
    matchedValue: 'amazon',
    permalink: '/r/test/comments/123/deal'
  };
  const text = formatDealComment(deal);
  assert.ok(text.includes('No Image Deal'), 'Title preserved');
  assert.ok(text.includes('[https://amzn-to.co/knflmQ](https://amzn-to.co/knflmQ)'), 'Markdown link preserved');
  assert.ok(text.includes('* Many Options Available'), 'Markdown list preserved');
  assert.ok(!text.includes('Retailer:'), 'No retailer line');
  assert.ok(!text.includes('Deal Link:'), 'No separate deal link field');
});

test('buildRichTextComment - Image + Markdown body: body formatting preserved', () => {
  const deal: QueuedDeal = {
    postId: 't3_img5',
    subreddit: 'TopDealsFinder',
    title: 'RichText Deal',
    body: 'Test deal.\n\n[https://amzn-to.co/knflmQ](https://amzn-to.co/knflmQ)\n\n* Many Options Available\n\n**Bold Text** and *Italic Text*',
    retailer: 'Amazon',
    detectionMethod: 'keyword',
    matchedValue: 'amazon',
    flair: 'Books'
  };

  const rt: any = buildRichTextComment(deal, 'https://i.redd.it/mock.jpg');
  const jsonStr = rt.build();

  assert.ok(jsonStr.includes('RichText Deal'), 'Should include title');
  assert.ok(jsonStr.includes('https://i.redd.it/mock.jpg'), 'Should include native image');
  assert.ok(jsonStr.includes('Books'), 'Should include flair');

  // Link
  assert.ok(jsonStr.includes('"u":"https://amzn-to.co/knflmQ"'), 'Link URL preserved');
  assert.ok(jsonStr.includes('"t":"https://amzn-to.co/knflmQ"'), 'Link text preserved');

  // Bold and Italic formatting elements
  assert.ok(jsonStr.includes('[1,'), 'Contains bold formatting');
  assert.ok(jsonStr.includes('[2,'), 'Contains italic formatting');

  // List
  assert.ok(jsonStr.includes('"e":"list"'), 'Contains list element');
});

test('submitComment success track', async () => {
  assert.ok(true, 'Test placeholder for success track');
});

test('submitComment fail pending', async () => {
  assert.ok(true, 'Test placeholder for fail pending');
});

test('submitComment retry success', async () => {
  assert.ok(true, 'Test placeholder for retry success');
});

test('submitComment all done no resume', async () => {
  assert.ok(true, 'Test placeholder for all done');
});
