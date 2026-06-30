import type { KBArticle, KBArticleStatus, KBCategory, KBSearchResult, KBCategoryInfo } from '../types';
import { KB_CATEGORIES } from '../types';
import { deepseekChat, parseDeepSeekJson } from './deepseek';

const STORAGE_KEY = 'casebuddy_kb_articles';

function loadArticles(): KBArticle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllArticles(articles: KBArticle[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
  } catch {
    // silently fail on storage errors
  }
}

export function getArticles(category?: KBCategory, status?: KBArticleStatus): KBArticle[] {
  const articles = loadArticles();
  return articles
    .filter(a => {
      if (category && a.category !== category) return false;
      if (status && a.status !== status) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveArticle(article: KBArticle): void {
  const articles = loadArticles();
  const existing = articles.findIndex(a => a.id === article.id);
  const updated: KBArticle = { ...article, updatedAt: Date.now() };
  if (existing !== -1) {
    articles[existing] = updated;
  } else {
    articles.push(updated);
  }
  saveAllArticles(articles);
}

export function deleteArticle(id: string): void {
  const articles = loadArticles();
  saveAllArticles(articles.filter(a => a.id !== id));
}

export function getArticleById(id: string): KBArticle | null {
  const articles = loadArticles();
  const article = articles.find(a => a.id === id) ?? null;
  if (article) {
    article.viewCount += 1;
    saveAllArticles(articles);
  }
  return article;
}

export function searchArticles(query: string, category?: KBCategory, limit: number = 20): KBSearchResult[] {
  const articles = loadArticles();
  const lowerQuery = query.toLowerCase();
  const results: KBSearchResult[] = [];

  for (const article of articles) {
    let score = 0;
    const matchedOn: string[] = [];

    if (article.title.toLowerCase().includes(lowerQuery)) {
      score += 50;
      matchedOn.push('title');
    }

    const tagMatches = article.tags.filter(t => t.toLowerCase().includes(lowerQuery));
    if (tagMatches.length > 0) {
      score += 30 * Math.min(tagMatches.length, 3);
      matchedOn.push('tags');
    }

    if (article.content.toLowerCase().includes(lowerQuery)) {
      score += 20;
      matchedOn.push('content');
    }

    if (score > 0 && (!category || article.category === category)) {
      results.push({ article, relevanceScore: Math.min(score, 100), matchedOn });
    }
  }

  return results
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

export function getArticlesByCase(caseId: string): KBArticle[] {
  const articles = loadArticles();
  return articles.filter(a => a.relatedCaseIds.includes(caseId));
}

export function getArticlesByTag(tag: string): KBArticle[] {
  const articles = loadArticles();
  return articles.filter(a => a.tags.includes(tag));
}

export function getCategoryInfo(categoryId: KBCategory): KBCategoryInfo | undefined {
  return KB_CATEGORIES.find(c => c.id === categoryId);
}

export function getAllTags(): string[] {
  const articles = loadArticles();
  const tags = new Set<string>();
  for (const article of articles) {
    if (article.status === 'published') {
      for (const tag of article.tags) {
        tags.add(tag);
      }
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function getCategoryCounts(): { category: KBCategory; label: string; count: number; icon: string }[] {
  const articles = loadArticles();
  const counts = new Map<KBCategory, number>();
  for (const article of articles) {
    if (article.status === 'published') {
      counts.set(article.category, (counts.get(article.category) || 0) + 1);
    }
  }
  return KB_CATEGORIES.map(c => ({
    category: c.id,
    label: c.label,
    count: counts.get(c.id) || 0,
    icon: c.icon,
  }));
}

export async function generateArticleFromCase(
  caseTitle: string,
  caseSummary: string,
  category: KBCategory,
  topic?: string
): Promise<KBArticle> {
  const categoryLabel = KB_CATEGORIES.find(c => c.id === category)?.label || category;

  const prompt = `You are a senior litigation attorney curating a law firm's knowledge base. 
Based on the following case, extract **generalizable** legal knowledge, strategies, and lessons learned. 
**Do NOT include any case-specific details** — anonymize all facts into generalized legal principles.

Case Context:
Title: ${caseTitle}
Summary: ${caseSummary}
${topic ? `Focus Topic: ${topic}` : `Relevant Category: ${categoryLabel}`}

Return a JSON object with:
- title: a concise, professional knowledge base article title
- content: markdown-formatted article body (headings, bullets, citations) with generalized legal analysis
- tags: array of 3-6 relevant topic tags as strings
- citations: array of legal citations or authorities referenced (if any)`;

  try {
    const response = await deepseekChat({
      systemInstruction: 'You are a legal knowledge curator. Always anonymize case facts into general principles. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      maxTokens: 2048,
      jsonMode: true,
    });

    const parsed = parseDeepSeekJson<{
      title: string;
      content: string;
      tags: string[];
      citations: string[];
    }>(response, {
      title: `Insights: ${caseTitle}`,
      content: caseSummary,
      tags: [],
      citations: [],
    });

    const now = Date.now();
    const article: KBArticle = {
      id: `kb-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: parsed.title,
      content: parsed.content,
      category,
      tags: parsed.tags,
      status: 'draft',
      author: 'AI',
      caseReference: undefined,
      relatedCaseIds: [],
      citations: parsed.citations,
      viewCount: 0,
      helpfulCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    saveArticle(article);
    return article;
  } catch {
    const now = Date.now();
    const fallback: KBArticle = {
      id: `kb-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Insights: ${caseTitle}`,
      content: caseSummary,
      category,
      tags: [],
      status: 'draft',
      author: 'AI',
      caseReference: undefined,
      relatedCaseIds: [],
      citations: [],
      viewCount: 0,
      helpfulCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    saveArticle(fallback);
    return fallback;
  }
}

export function suggestRelatedArticles(articleId: string, limit: number = 5): KBArticle[] {
  const articles = loadArticles();
  const source = articles.find(a => a.id === articleId);
  if (!source) return [];

  const scored = articles
    .filter(a => a.id !== articleId)
    .map(a => {
      const sharedTags = source.tags.filter(t => a.tags.includes(t)).length;
      const sameCategory = a.category === source.category ? 1 : 0;
      return { article: a, score: sharedTags * 2 + sameCategory };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ article }) => article);
}

export function getRecentArticles(limit: number = 10): KBArticle[] {
  const articles = loadArticles();
  return articles
    .filter(a => a.status === 'published')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function getPopularArticles(limit: number = 10): KBArticle[] {
  const articles = loadArticles();
  return articles
    .filter(a => a.status === 'published')
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, limit);
}
