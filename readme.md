# TDFDealThread

A fully automated, free Reddit moderator utility built on the Devvit platform. 

TDFDealThread automatically monitors your subreddit for deal posts (from specified retailers) and aggregates them into a beautifully formatted Daily Megathread.

## What it does
TDFDealThread listens for new posts containing product URLs or retailer keywords. When a deal is detected, it is placed in an internal queue. Once a minimum threshold of deals is reached, the bot creates a Daily Megathread for that day and automatically publishes each queued deal as a comment within the thread. It keeps the Megathread clean, prevents spam, and provides a central location for shoppers to find the day's best deals.

## Who it is for
This app is built for Deal & Shopping subreddit moderators who want to reduce front-page clutter while preserving all the valuable deals submitted by users.

## Installation
Install TDFDealThread via the Reddit Developer App Directory onto your subreddit. Once installed, it runs silently in the background and requires zero code configuration.

## Moderator setup
After installation, open your subreddit's Mod Tools and locate the **"🛠️ Manage Today's Megathread"** menu item. This opens the Moderator Dashboard where you can configure Megathread images and manage the current day's deal comments.

## Default Megathread Image
You can set a permanent fallback image that will be used for all Daily Megathreads. In the Moderator Dashboard, enter a valid image URL and click "Set Default". This image will persist across all days unless you explicitly change it.

## Today's Megathread Image
If you want a specific image for a specific event (e.g., "Black Friday Sale"), you can override the Default Image just for today's Megathread. Setting this will immediately update the active Megathread's banner. Removing it will safely revert to the Default Image.

## Deal detection
The app scans incoming posts for specific domains (e.g., `amazon.com`, `flipkart.com`, `myntra.com`) or keywords (e.g., `Amazon Deal`, `Myntra Sale`). When matched, the deal's title, body, flair, and image are collected.

## Megathread creation
A Megathread is not created instantly on the first deal to prevent empty threads. Once a specific threshold (e.g., 5 deals) is reached, the app creates the Megathread and deposits all pending deals as comments.

## Delete & Create New Now
If the Megathread becomes corrupted, reaches Reddit's comment limit, or you simply want a fresh start for the day, you can click "Recreate Thread" and choose "Now". The app will delete the existing thread and immediately spin up a new one, re-publishing all deals from today's queue into the new thread.

## Delete & Create On Next Deal
Similar to above, but instead of creating the thread immediately, the bot deletes the old thread and waits until the *next* deal is submitted before creating the new one.

## Pending deals
Deals that fail to publish (due to temporary Reddit API outages) are marked as "Pending" and safely retained in the queue. 

## Comment management
From the Moderator Dashboard, you can see every deal posted today. You can force-publish pending deals or delete active deal comments. 

## Restore behavior
If a deal was accidentally deleted from the thread, a moderator can click "Restore" in the dashboard. The bot will re-create the comment using the data saved in the 3-day operational queue.

## Data retention
TDFDealThread does not hoard data. The operational queue that stores copied deal content is strictly deleted after 3 days (72 hours). Deduplication identifiers are kept for 30 days to prevent repost spam.

## User Content deletion
If a user deletes their original Reddit post, TDFDealThread's `onPostDelete` trigger detects this and automatically deletes the copied comment from the Megathread, ensuring User Content is respected as soon as possible.

## Privacy Policy
TDFDealThread is fully compliant with Reddit Developer Policies. All data processing occurs on Reddit's servers. We do not sell data or monetize the app. See [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) for full details.

## Support / deletion requests
If you need a deal comment removed manually, or have questions about the application, please send a Modmail to the moderators of the subreddit where the app is installed. They have full control to manage or delete any copied content.

## Limitations
- Only one Megathread is active per subreddit per day.
- Supports standard text and link posts.
- Deal comments will fail to display an image if the original post image could not be scraped.

## Version / changelog
- **v1.0.0**: Initial release featuring intelligent deal detection, safe queuing, JIT image overriding, and robust `onPostDelete` user-content scrubbing.
