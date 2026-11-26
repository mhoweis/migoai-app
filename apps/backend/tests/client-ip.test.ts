import { clientIpMiddleware } from '../src/middlewares/client-ip.middleware';

const run = (headers: Record<string, string>, proxyIp = '172.71.1.1') => {
  const req: any = Object.create({ get ip() { return proxyIp; } });
  req.headers = headers;
  const next = jest.fn();
  clientIpMiddleware(req, {} as any, next);
  expect(next).toHaveBeenCalled();
  return req.ip as string;
};

describe('clientIpMiddleware', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('uses CF-Connecting-IP on Render', () => {
    process.env.RENDER = 'true';
    expect(run({ 'cf-connecting-ip': '1.2.3.4' })).toBe('1.2.3.4');
    expect(run({ 'cf-connecting-ip': '2001:db8::1' })).toBe('2001:db8::1');
  });

  it('ignores the header when not behind Cloudflare', () => {
    delete process.env.RENDER;
    delete process.env.TRUST_CF_CONNECTING_IP;
    expect(run({ 'cf-connecting-ip': '1.2.3.4' })).toBe('172.71.1.1');
  });

  it('can be switched off on Render', () => {
    process.env.RENDER = 'true';
    process.env.TRUST_CF_CONNECTING_IP = 'false';
    expect(run({ 'cf-connecting-ip': '1.2.3.4' })).toBe('172.71.1.1');
  });

  it('ignores values that are not IP addresses', () => {
    process.env.RENDER = 'true';
    expect(run({ 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' })).toBe('172.71.1.1');
    expect(run({ 'cf-connecting-ip': 'evil' })).toBe('172.71.1.1');
  });
});
