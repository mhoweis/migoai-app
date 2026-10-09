import prisma from '../../database/prisma';

export interface TourismPassageInput {
  site: string;
  emirate: string;
  region?: string;
  language: 'en' | 'ar';
  url: string;
  pageTitle: string;
  heading?: string;
  text: string;
  contentHash: string;
  position: number;
  fetchedAt: Date;
}

export interface TourismCrawlRunInput {
  site: string;
  status: 'ok' | 'partial' | 'failed';
  pagesFetched: number;
  pagesFailed: number;
  passages: number;
  error?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface TourismStore {
  replaceSitePassages(site: string, passages: TourismPassageInput[]): Promise<void>;
  createCrawlRun(run: TourismCrawlRunInput): Promise<void>;
}

export const tourismStore: TourismStore = {
  async replaceSitePassages(site, passages) {
    await prisma.$transaction(async transaction => {
      await transaction.tourismPassage.deleteMany({ where: { site } });
      await transaction.tourismPassage.createMany({ data: passages });
    });
  },

  async createCrawlRun(run) {
    await prisma.tourismCrawlRun.create({ data: run });
  },
};
