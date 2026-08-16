# Privacy Policy for TDFDealThread

**Last Updated:** August 13, 2026

TDFDealThread ("we", "our", or "the App") is a free moderator utility built on the Reddit Developer Platform (Devvit). This Privacy Policy explains how we collect, use, and store information when you use the App within Reddit.

## 1. Information We Access and Collect
When a post is submitted to a subreddit where TDFDealThread is installed, the App automatically receives and processes the following Reddit User Content:
*   **Post Title and Body**
*   **Post URL and Permalink**
*   **Post Flair and Images**
*   **Post Creation Date**

## 2. How We Use Your Information (Purpose)
TDFDealThread uses this information strictly for the purpose of identifying and compiling deals into a daily "Megathread" within the same subreddit. The App maintains a link to your original Reddit post to correctly attribute your content according to Reddit Developer Terms, without storing or displaying your Reddit username.

We **do not** use this information for:
*   Analytics or profiling
*   AI or Machine Learning training
*   Advertising or marketing
*   Affiliate link tracking or monetization

## 3. Data Storage and Retention
All information accessed by TDFDealThread remains strictly within Reddit's infrastructure (Devvit Redis and Reddit Posts/Comments). Data is completely isolated by subreddit. 

*   **Copied Comments:** When a deal is copied into a Megathread comment, it remains there as long as the Megathread exists.
*   **Operational Queue:** Temporary deal data (User Content) stored for processing and manual moderation is automatically deleted (TTL expires) after **3 days (72 hours)**.
*   **Deduplication Data:** Post IDs are stored for up to 30 days solely to prevent processing duplicate deals.

## 4. Deletion of User Content
We respect your right to delete your content. 
*   If you delete your original deal post, TDFDealThread will automatically detect the deletion and securely delete the copied comment from the Megathread as soon as possible.
*   The corresponding data in the operational queue will also be scrubbed.

## 5. Third-Party Sharing
**None.** TDFDealThread does not transmit, sell, or share Reddit User Content with any external servers, third-party services, or external APIs. All data processing occurs internally on Reddit's Developer Platform.

## 6. Security
Your data is protected by Reddit’s underlying infrastructure and security protocols. TDFDealThread uses atomic operations to safely process data and enforces strict moderator authorization checks for all management actions.

## 7. User Deletion Requests & Contact
If you have questions about this Privacy Policy, or if you need to request the manual modification or deletion of your content copied by the App, please contact the moderation team of the subreddit where the deal was posted (e.g., via Modmail), as they have direct tools to remove Megathread comments. 

For technical support or developer inquiries, you can reach out via Modmail to the subreddit where this application is actively maintained or deployed.
