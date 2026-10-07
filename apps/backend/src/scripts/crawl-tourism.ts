import prisma from '../database/prisma';
import { crawlAll } from '../services/tourism/crawler';

async function main(): Promise<void> {
  const siteArgument = process.argv.find(argument => argument.startsWith('--site='));
  const siteKey = siteArgument?.slice('--site='.length);
  const results = await crawlAll(siteKey);
  const counts = await prisma.tourismPassage.groupBy({
    by: ['site', 'language'],
    where: { site: { in: results.map(result => result.site) } },
    _count: { _all: true },
  });
  for (const result of results) {
    console.log(JSON.stringify({
      ...result,
      storedPassages: {
        en: counts.find(count => count.site === result.site && count.language === 'en')?._count._all || 0,
        ar: counts.find(count => count.site === result.site && count.language === 'ar')?._count._all || 0,
      },
    }));
  }
}

main()
  .catch(error => {
    console.error('Tourism crawl failed', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
