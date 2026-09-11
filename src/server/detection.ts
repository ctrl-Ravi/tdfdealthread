export type DealDetectionResult =
  | {
      matched: true;
      retailer: string;
      method: 'domain' | 'keyword';
      matchedValue: string;
    }
  | {
      matched: false;
    };

type RetailerConfig = {
  name: string;
  keywords: string[];
  domains: string[];
};

const RETAILERS: RetailerConfig[] = [
  {
    name: 'Amazon',
    keywords: ['amazon'],
    domains: ['amazon.in', 'amazon.com', 'amzn.to', 'amzn-to.co', 'link.amazon'],
  },
  {
    name: 'Flipkart',
    keywords: ['flipkart'],
    domains: ['flipkart.com', 'fkrt.it', 'fkrt.store', 'fkrt.cc', 'fkrt.co', 'fkrt.to', 'fkrt.site', 'fkrt.in'],
  },
  {
    name: 'Myntra',
    keywords: ['myntra'],
    domains: ['myntra.com', 'myntr.in', 'myntr.store'],
  },
  {
    name: 'Ajio',
    keywords: ['ajio'],
    domains: ['ajio.com', 'ajiio.store', 'ajio.me'],
  },
  {
    name: 'Shopsy',
    keywords: ['shopsy'],
    domains: ['shopsy.in'],
  },
  {
    name: 'Meesho',
    keywords: ['meesho'],
    domains: ['meesho.com'],
  },
  {
    name: 'Croma',
    keywords: ['croma'],
    domains: ['croma.com'],
  },
  {
    name: 'Tata Cliq',
    keywords: ['tata cliq'],
    domains: ['tatacliq.com'],
  },
  {
    name: 'Reliance Digital',
    keywords: ['reliance digital'],
    domains: ['reliancedigital.in'],
  },
];

function extractUrls(text: string): string[] {
  if (!text) return [];
  const urls: string[] = [];
  const regex = /https?:\/\/[^\s)\]'"<>]+/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return urls;
}

function removeUrlsAndDomains(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/https?:\/\/[^\s)\]'"<>]+/gi, ' ');
  // Also remove standalone domains that could cause false keyword matches
  cleaned = cleaned.replace(/\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi, ' ');
  return cleaned;
}

function containsKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

export function detectRetailer(post: {
  title?: string;
  body?: string;
  url?: string;
}): DealDetectionResult {
  let postUrlStr = post.url || '';
  if (postUrlStr && !postUrlStr.toLowerCase().startsWith('http')) {
    postUrlStr = 'https://' + postUrlStr;
  }

  const urls: string[] = [
    ...extractUrls(postUrlStr),
    ...extractUrls(post.title || ''),
    ...extractUrls(post.body || ''),
  ];

  // 1. Domain Match
  for (const retailer of RETAILERS) {
    for (const urlStr of urls) {
      try {
        const urlObj = new URL(urlStr);
        let hostname = urlObj.hostname.toLowerCase();
        if (hostname.endsWith('.')) {
          hostname = hostname.slice(0, -1);
        }
        for (const domain of retailer.domains) {
          if (hostname === domain || hostname.endsWith(`.${domain}`)) {
            return {
              matched: true,
              retailer: retailer.name,
              method: 'domain',
              matchedValue: domain,
            };
          }
        }
      } catch {
        // invalid url, skip
      }
    }
  }

  // 2. Keyword Match
  const titleClean = removeUrlsAndDomains(post.title || '');
  const bodyClean = removeUrlsAndDomains(post.body || '');
  const urlClean = removeUrlsAndDomains(post.url || '');

  for (const retailer of RETAILERS) {
    for (const keyword of retailer.keywords) {
      if (
        containsKeyword(titleClean, keyword) ||
        containsKeyword(bodyClean, keyword) ||
        containsKeyword(urlClean, keyword)
      ) {
        return {
          matched: true,
          retailer: retailer.name,
          method: 'keyword',
          matchedValue: keyword,
        };
      }
    }
  }

  return { matched: false };
}
