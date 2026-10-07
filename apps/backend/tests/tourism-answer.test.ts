import * as retrieval from '../src/services/tourism/retrieval';
import { answerTourismQuestion } from '../src/services/tourism/answer';
import { tourismSites } from '../src/services/tourism/sources';

jest.spyOn(retrieval, 'searchTourism');

const searchTourism = retrieval.searchTourism as jest.MockedFunction<typeof retrieval.searchTourism>;
const passages = [
  {
    site: 'visit-abu-dhabi',
    siteName: 'Visit Abu Dhabi',
    emirate: 'Abu Dhabi',
    url: 'https://visitabudhabi.ae/en/museums',
    pageTitle: 'Museums',
    heading: 'Louvre Abu Dhabi',
    text: 'The museum presents works and exhibitions from cultures around the world, with galleries arranged across its visitor spaces.',
    fetchedAt: new Date('2026-10-07T10:00:00.000Z'),
  },
  {
    site: 'visit-dubai',
    siteName: 'Visit Dubai',
    emirate: 'Dubai',
    url: 'https://www.visitdubai.com/en/landmarks',
    pageTitle: 'Landmarks',
    text: 'The city has many visitor attractions and official tourism experiences for people exploring the emirate.',
    fetchedAt: new Date('2026-10-07T10:00:00.000Z'),
  },
  {
    site: 'visit-sharjah',
    siteName: 'Visit Sharjah',
    emirate: 'Sharjah',
    url: 'https://www.visitsharjah.com/en/heritage',
    pageTitle: 'Heritage',
    text: 'Sharjah offers museums and cultural places for visitors interested in heritage and history.',
    fetchedAt: new Date('2026-10-07T10:00:00.000Z'),
  },
];

const result = (overrides: Partial<Awaited<ReturnType<typeof retrieval.searchTourism>>> = {}) => ({
  language: 'en' as const,
  emirates: ['Abu Dhabi'],
  passages,
  missingSites: [],
  ...overrides,
});

describe('answerTourismQuestion', () => {
  beforeEach(() => {
    searchTourism.mockReset();
  });

  it('keeps a valid cited answer and returns only sources cited in the text', async () => {
    searchTourism.mockResolvedValue(result() as any);
    const generate = jest.fn().mockResolvedValue(JSON.stringify({
      answer: 'The museum presents works and exhibitions from cultures around the world. [1]',
      used: [1, 2],
    }));

    const response = await answerTourismQuestion('What museums are there in Abu Dhabi?', generate);

    expect(response.response).toContain('cultures around the world');
    expect(response.tourismSources.map(source => source.id)).toEqual([1]);
    expect(response.grounding).toBe('official_sources');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('uses extractive citations when a marker is outside the prompt range', async () => {
    searchTourism.mockResolvedValue(result() as any);
    const generate = jest.fn().mockResolvedValue(JSON.stringify({
      answer: 'This fact has an invalid source marker in the answer. [9]',
      used: [9],
    }));

    const response = await answerTourismQuestion('What museums are there in Abu Dhabi?', generate);

    expect(response.response).toContain("Here's what the official tourism sites say:");
    expect(response.tourismSources).toHaveLength(3);
    expect(response.response).toContain('[1]');
    expect(response.tourismSources.every(source => source.excerpt.length <= 600)).toBe(true);
  });

  it('uses extractive citations when the provider throws', async () => {
    searchTourism.mockResolvedValue(result() as any);
    const generate = jest.fn().mockRejectedValue(new Error('provider unavailable'));

    const response = await answerTourismQuestion('What museums are there in Abu Dhabi?', generate);

    expect(response.response).toContain("Here's what the official tourism sites say:");
    expect(response.tourismSources).toHaveLength(3);
  });

  it('uses not-found copy when the model returns NOT_FOUND', async () => {
    searchTourism.mockResolvedValue(result() as any);
    const generate = jest.fn().mockResolvedValue(JSON.stringify({ answer: 'NOT_FOUND', used: [] }));

    const response = await answerTourismQuestion('What museums are there in Abu Dhabi?', generate);

    expect(response.response).toBe(
      "I couldn't find this on the official tourism sites I use, so I won't guess. Try asking about a specific place, activity or emirate.",
    );
    expect(response.tourismSources).toEqual([]);
    expect(response.grounding).toBe('not_found');
  });

  it('does not generate an answer when retrieval returns no passages', async () => {
    searchTourism.mockResolvedValue(result({ passages: [], missingSites: [] }) as any);
    const generate = jest.fn();

    const response = await answerTourismQuestion('What museums are there in Abu Dhabi?', generate);

    expect(response.response).toBe(
      "I couldn't find this on the official tourism sites I use, so I won't guess. Try asking about a specific place, activity or emirate.",
    );
    expect(generate).not.toHaveBeenCalled();
    expect(response.grounding).toBe('not_found');
  });

  it('names filtered sites without content in the missing-site response', async () => {
    const uaq = tourismSites.find(site => site.key === 'visit-uaq')!;
    searchTourism.mockResolvedValue(result({
      emirates: ['Umm Al Quwain'],
      passages: [],
      missingSites: [uaq],
    }) as any);
    const generate = jest.fn();

    const response = await answerTourismQuestion('Things to do in Umm Al Quwain', generate);

    expect(response.response).toBe(
      "I don't have content from Visit Umm Al Quwain yet, so I won't guess about Umm Al Quwain.",
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
