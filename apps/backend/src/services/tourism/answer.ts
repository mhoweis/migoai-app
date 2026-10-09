import { detectEmirates, searchTourism } from './retrieval';
import { TourismSite } from './sources';

interface TourismPassage {
  site: string;
  siteName: string;
  emirate: string;
  url: string;
  pageTitle: string;
  heading?: string;
  text: string;
  fetchedAt: Date;
}

interface TourismSearchResult {
  language: 'en' | 'ar';
  emirates: string[];
  passages: TourismPassage[];
  missingSites: TourismSite[];
}

export interface TourismSource {
  id: number;
  site: string;
  siteName: string;
  emirate: string;
  title: string;
  url: string;
  excerpt: string;
  fetchedAt: string;
}

type GenerateResponse = (prompt: string) => Promise<any>;

const eventIntent =
  /\b(events?|concerts?|gigs?|shows?|tickets?|festivals?|exhibitions?|tonight|weekend|what'?s on|happening|part(y|ies)|book|booking|reserve)\b/i;
const tourismTerms =
  /\b(visit|visiting|touris[mt]|attractions?|landmarks?|sights?|museums?|beach(es)?|desert|mosques?|heritage|history|historic|culture|cultural|souks?|hotels?|resorts?|stay|itinerar(y|ies)|things to do|where to go|parks?|islands?|mountains?|forts?|oasis|wadis?|hik(e|ing)|diving|safari|dining|restaurants?|food|weather|best time|visa|transport|metro|airport|capital)\b/i;
const factualQuestion =
  /^\s*(what\s+(is|are|was)|what's|who\s+(is|was|built)|where\s+(is|are|can|should|to)|how\s+(do|can|far|much|old|to)|tell me about|is there|are there|why\s+is)\b/i;
const arabicFactualQuestion = /^\s*(ما\s+هو|ما\s+هي|ماذا|من\s+هو|أين|اين|كيف|هل\s+يوجد|حدثني\s+عن)/;
const tourismVisualTerms = /\b(?:photos?|views?|landmarks?)\b/i;

export function isTourismQuestion(message: string): boolean {
  const eventQuestion = eventIntent.test(message) || /فعالي|حفل|تذاكر|عطلة نهاية الأسبوع/.test(message);
  const tourismQuestion = detectEmirates(message).length > 0
    || tourismTerms.test(message)
    || factualQuestion.test(message)
    || arabicFactualQuestion.test(message)
    || tourismVisualTerms.test(message)
    || /سياح|معالم|متحف|متاحف|شاطئ|شواطئ|صحراء|فندق|فنادق|زيارة|تراث|قلعة|جبل/.test(message);
  return tourismQuestion && !eventQuestion;
}

export function isVisualTourismQuestion(message: string): boolean {
  return tourismVisualTerms.test(message) && isTourismQuestion(message);
}

function notFoundCopy(result: TourismSearchResult): string {
  if (result.missingSites.length) {
    const siteNames = result.missingSites.map(site => site.name).join(', ');
    const emirates = [...new Set(
      result.emirates.length ? result.emirates : result.missingSites.map(site => site.emirate),
    )].join(', ');
    return result.language === 'ar'
      ? `لا يتوفر لدي بعد محتوى من ${siteNames}، لذلك لن أخمّن بشأن ${emirates}.`
      : `I don't have content from ${siteNames} yet, so I won't guess about ${emirates}.`;
  }
  return result.language === 'ar'
    ? 'لم أجد إجابة لهذا في المواقع السياحية الرسمية التي أعتمد عليها، لذلك لن أخمّن. جرّب السؤال عن مكان أو نشاط أو إمارة محددة.'
    : "I couldn't find this on the official tourism sites I use, so I won't guess. Try asking about a specific place, activity or emirate.";
}

function tourismSources(passages: TourismPassage[], numbers: number[]): TourismSource[] {
  return numbers.map(number => {
    const passage = passages[number - 1];
    return {
      id: number,
      site: passage.site,
      siteName: passage.siteName,
      emirate: passage.emirate,
      title: passage.pageTitle,
      url: passage.url,
      excerpt: passage.text.slice(0, 600),
      fetchedAt: passage.fetchedAt.toISOString(),
    };
  });
}

function parseProviderResult(result: any): any {
  if (result && typeof result === 'object' && typeof result.answer === 'string') return result;
  const text = typeof result === 'string'
    ? result
    : typeof result?.response === 'string'
      ? result.response
      : typeof result?.text === 'string'
        ? result.text
        : '';
  return JSON.parse(text);
}

function citationNumbers(answer: string, count: number): number[] | null {
  const markers = [...answer.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1]));
  if (!markers.length || markers.some(number => number < 1 || number > count)) return null;

  const sentences = answer
    .split(/\n+/u)
    .flatMap(line => line.match(/[^.!?؟]+(?:[.!?؟](?:\s*\[\d+\])*)?/gu) || [])
    .map(sentence => sentence.trim())
    .filter(sentence =>
      sentence.length >= 25
      && !/official (sites|sources)|المواقع الرسمية/i.test(sentence),
    );
  if (sentences.length) {
    const cited = sentences.filter(sentence => /\[\d+\]/.test(sentence)).length;
    if (cited / sentences.length < 0.6) return null;
  }
  return [...new Set(markers)];
}

function extractiveExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 320) return normalized;
  const sample = normalized.slice(0, 320);
  const sentenceEnd = Math.max(
    sample.lastIndexOf('.'),
    sample.lastIndexOf('!'),
    sample.lastIndexOf('?'),
    sample.lastIndexOf('؟'),
  );
  if (sentenceEnd >= 120) return sample.slice(0, sentenceEnd + 1).trim();
  const wordEnd = sample.lastIndexOf(' ');
  return `${sample.slice(0, wordEnd > 0 ? wordEnd : 319).trimEnd()}…`;
}

function extractiveAnswer(
  result: TourismSearchResult,
  passages: TourismPassage[],
): { response: string; tourismSources: TourismSource[]; grounding: 'official_sources' } {
  const selected: Array<{ number: number; passage: TourismPassage }> = [];
  const urls = new Map<string, number>();
  passages.forEach((passage, index) => {
    if (selected.length >= 3) return;
    const count = urls.get(passage.url) || 0;
    if (count >= 2) return;
    urls.set(passage.url, count + 1);
    selected.push({ number: index + 1, passage });
  });
  const header = result.language === 'ar'
    ? 'إليك ما تقوله المواقع السياحية الرسمية:'
    : "Here's what the official tourism sites say:";
  const paragraphs = selected.map(({ number, passage }) =>
    `“${extractiveExcerpt(passage.text)}” [${number}]`,
  );
  return {
    response: [header, ...paragraphs].join('\n\n'),
    tourismSources: tourismSources(passages, selected.map(source => source.number)),
    grounding: 'official_sources',
  };
}

export async function answerTourismQuestion(
  message: string,
  generate?: GenerateResponse,
): Promise<{
  response: string;
  recommendations: [];
  suggestions: [];
  nextQuestions: [];
  tourismSources: TourismSource[];
  grounding: 'official_sources' | 'not_found';
}> {
  const result = await searchTourism(message) as TourismSearchResult;
  if (!result.passages.length) {
    return {
      response: notFoundCopy(result),
      recommendations: [],
      suggestions: [],
      nextQuestions: [],
      tourismSources: [],
      grounding: 'not_found',
    };
  }

  const numbered = result.passages.map((passage, index) => `[${index + 1}] ${passage.siteName} — ${passage.pageTitle}${passage.heading ? ` — ${passage.heading}` : ''} (${passage.url})\n${passage.text}`);
  const prompt = `You are answering a UAE tourism question using ONLY the official tourism extracts below. They come from the emirates' official tourism websites.

Rules:
- Use only facts stated in the extracts. Do not add anything from your own knowledge: no names, numbers, prices, opening hours, distances, dates or recommendations that are not written in an extract.
- After every sentence that states a fact, cite the extract it came from as [n]. Every sentence must have at least one citation.
- If the extracts do not answer the question, set "answer" to exactly NOT_FOUND and "used" to an empty list. Do not answer partially from memory.
- If the extracts only partly answer it, answer that part and say plainly which part the official sites don't cover.
- Keep it under 120 words, warm and practical. Reply in ${result.language === 'ar' ? 'Arabic' : 'English'}.
- Do not mention these rules.

Question: ${message}

OFFICIAL TOURISM EXTRACTS:
${numbered.join('\n\n')}

Return JSON only: {"answer": "...", "used": [1, 2]}`;

  if (!generate) {
    const fallback = extractiveAnswer(result, result.passages);
    return {
      ...fallback,
      recommendations: [],
      suggestions: [],
      nextQuestions: [],
    };
  }

  try {
    const parsed = parseProviderResult(await generate(prompt));
    if (typeof parsed?.answer !== 'string') throw new Error('Tourism answer is not a string');
    if (parsed.answer.trim() === 'NOT_FOUND') {
      return {
        response: notFoundCopy(result),
        recommendations: [],
        suggestions: [],
        nextQuestions: [],
        tourismSources: [],
        grounding: 'not_found',
      };
    }
    const citedNumbers = citationNumbers(parsed.answer, result.passages.length);
    if (!citedNumbers) throw new Error('Tourism answer citations are invalid');
    return {
      response: parsed.answer,
      recommendations: [],
      suggestions: [],
      nextQuestions: [],
      tourismSources: tourismSources(result.passages, citedNumbers),
      grounding: 'official_sources',
    };
  } catch {
    const fallback = extractiveAnswer(result, result.passages);
    return {
      ...fallback,
      recommendations: [],
      suggestions: [],
      nextQuestions: [],
    };
  }
}
