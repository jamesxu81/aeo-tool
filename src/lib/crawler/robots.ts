import robotsParser from 'robots-parser';
import axios from 'axios';

const UA = 'AEOBot/1.0 (+https://aeo-tool.com/bot)';
const cache = new Map<string, ReturnType<typeof robotsParser>>();

export async function getRobots(domain: string) {
  if (cache.has(domain)) return cache.get(domain)!;
  const url = `https://${domain}/robots.txt`;
  try {
    const { data } = await axios.get<string>(url, {
      timeout: 5000,
      headers: { 'User-Agent': UA },
      responseType: 'text',
    });
    const robots = robotsParser(url, data);
    cache.set(domain, robots);
    return robots;
  } catch {
    // No robots.txt — allow all
    const robots = robotsParser(url, '');
    cache.set(domain, robots);
    return robots;
  }
}

export async function isAllowed(domain: string, path: string): Promise<boolean> {
  const robots = await getRobots(domain);
  return robots.isAllowed(`https://${domain}${path}`, UA) ?? true;
}

export { UA };
