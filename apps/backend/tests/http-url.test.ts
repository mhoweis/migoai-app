import { httpUrl, isHttpUrl } from '../src/utils/http-url';

describe('httpUrl', () => {
  it.each(['https://platinumlist.net/e/1', 'http://example.com/a?b=c'])('accepts web link %s', url => {
    expect(httpUrl().safeParse(url).success).toBe(true);
    expect(isHttpUrl(url)).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://a.b', '#tickets', 'not a url', ''])(
    'rejects %s',
    url => {
      expect(httpUrl().safeParse(url).success).toBe(false);
      expect(isHttpUrl(url)).toBe(false);
    },
  );

  it('rejects links longer than 2048 characters', () => {
    expect(httpUrl().safeParse(`https://a.com/${'x'.repeat(2048)}`).success).toBe(false);
  });
});
