/** Link-preview crawlers that must not consume burn-on-read clips. */
const LINK_PREVIEW_PATTERNS = [
  /facebookexternalhit/i,
  /facebot/i,
  /whatsapp/i,
  /twitterbot/i,
  /slackbot/i,
  /slack-imgproxy/i,
  /linkedinbot/i,
  /discordbot/i,
  /telegrambot/i,
  /googlebot/i,
  /bingbot/i,
  /applebot/i,
  /embedly/i,
  /quora link preview/i,
  /redditbot/i,
  /pinterestbot/i,
  /vkshare/i,
  /skypeuripreview/i,
  /snap url preview/i,
  /iframely/i,
  /meta-externalagent/i,
];

export function isLinkPreviewCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return LINK_PREVIEW_PATTERNS.some((pattern) => pattern.test(userAgent));
}
