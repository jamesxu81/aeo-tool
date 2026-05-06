/**
 * AI Check orchestrator
 *
 * Fans out per keyword × provider (currently SerpAPI only).
 * Implements 24h query cache — skips re-running if a fresh result exists.
 *
 * TODO: Add OpenAI provider  (OPENAI_API_KEY)
 * TODO: Add Perplexity provider (PERPLEXITY_API_KEY)
 */

import { PrismaClient } from '@prisma/client';
import { checkWithSerpApi } from './providers/serpapi';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const ENABLED_PROVIDERS = ['serpapi'] as const;
type Provider = (typeof ENABLED_PROVIDERS)[number];

export interface AiCheckSummary {
  keyword: string;
  provider: Provider;
  ourDomainCited: boolean;
  ourPosition: number | null;
  allCitedDomains: string[];
}

/** Check cache — return existing result if fresh enough */
async function getCached(
  prisma: PrismaClient,
  keyword: string,
  provider: string,
): Promise<AiCheckSummary | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);
  const cached = await prisma.aiCheck.findFirst({
    where: {
      keyword,
      provider,
      cachedAt: { gte: cutoff },
    },
    orderBy: { cachedAt: 'desc' },
  });
  if (!cached) return null;
  return {
    keyword: cached.keyword,
    provider: cached.provider as Provider,
    ourDomainCited: cached.ourDomainCited,
    ourPosition: cached.ourPosition,
    allCitedDomains: cached.allCitedDomains,
  };
}

/**
 * Run AI citation checks for all keywords × providers.
 * Writes results to AiCheck table. Returns summary array.
 */
export async function runAiChecks(
  prisma: PrismaClient,
  auditId: string,
  ourDomain: string,
  keywords: string[],
  onProgress?: (msg: string) => Promise<void>,
): Promise<AiCheckSummary[]> {
  const results: AiCheckSummary[] = [];

  for (const keyword of keywords) {
    for (const provider of ENABLED_PROVIDERS) {
      // Check 24h cache first
      const cached = await getCached(prisma, keyword, provider);
      if (cached) {
        await onProgress?.(`[cache hit] "${keyword}" via ${provider}`);
        // Still write a record linked to this audit
        await prisma.aiCheck.create({
          data: {
            auditId,
            keyword,
            provider,
            ourDomainCited: cached.ourDomainCited,
            ourPosition: cached.ourPosition,
            allCitedDomains: cached.allCitedDomains,
            rawResponse: { cached: true },
          },
        });
        results.push(cached);
        continue;
      }

      await onProgress?.(`Checking "${keyword}" via ${provider}…`);

      try {
        let result;
        if (provider === 'serpapi') {
          result = await checkWithSerpApi(keyword, ourDomain);
        } else {
          throw new Error(`Provider ${provider} not yet implemented`);
        }

        // Persist result
        await prisma.aiCheck.create({
          data: {
            auditId,
            keyword,
            provider,
            ourDomainCited: result.ourDomainCited,
            ourPosition: result.ourPosition,
            allCitedDomains: result.allCitedDomains,
            rawResponse: result.rawResponse as object,
          },
        });

        const cited = result.ourDomainCited
          ? `✅ cited at position ${result.ourPosition}`
          : '❌ not cited';
        await onProgress?.(
          `"${keyword}" via ${provider}: ${cited} (${result.allCitedDomains.length} domains found)`,
        );

        results.push({
          keyword,
          provider,
          ourDomainCited: result.ourDomainCited,
          ourPosition: result.ourPosition,
          allCitedDomains: result.allCitedDomains,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await onProgress?.(`❌ "${keyword}" via ${provider} failed: ${msg}`);
        // Don't throw — continue with remaining keywords
      }
    }
  }

  return results;
}
