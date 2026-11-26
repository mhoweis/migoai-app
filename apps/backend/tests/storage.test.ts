// storage.service reads config at import time, so each case loads it fresh.
const loadStorage = (env: Record<string, string>) => {
  process.env = {
    ...process.env,
    SUPABASE_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'test-secret-1',
    JWT_REFRESH_SECRET: 'test-secret-2',
    NODE_ENV: 'test',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    ...env,
  };
  let mod: typeof import('../src/services/storage.service');
  jest.isolateModules(() => { mod = require('../src/services/storage.service'); });
  return mod!;
};

describe('normaliseSupabaseUrl', () => {
  const { normaliseSupabaseUrl } = loadStorage({});
  const ref = 'vgepjcjntrkdpqnikiew';
  it.each([
    [`https://${ref}.supabase.co`, `https://${ref}.supabase.co`],
    [`https://${ref}.supabase.co/rest/v1/`, `https://${ref}.supabase.co`],
    [`${ref}.supabase.co`, `https://${ref}.supabase.co`],
    [`https://supabase.com/dashboard/project/${ref}/settings/api`, `https://${ref}.supabase.co`],
    [`http://${ref}.supabase.co`, ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseSupabaseUrl(input)).toBe(expected);
  });
});

describe('uploadPublicImage', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('is off without both settings', () => {
    expect(loadStorage({ SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }).storageConfigured()).toBe(false);
  });

  it('sends a new-style secret key only as apikey and returns the public URL', async () => {
    const storage = loadStorage({ SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;
    const url = await storage.uploadPublicImage('a.jpg', Buffer.from('x'), 'image/jpeg');
    expect(url).toBe('https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/uploads/a.jpg');
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe('https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/uploads/a.jpg');
    expect(init.headers.apikey).toBe('sb_secret_x');
    expect(init.headers.Authorization).toBeUndefined();
    expect(storage.storageStatus()).toBe('supabase');
  });

  it('sends a legacy JWT key as Bearer too, and reports a refusal', async () => {
    const storage = loadStorage({ SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOi' });
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid' });
    global.fetch = fetchMock as any;
    await expect(storage.uploadPublicImage('a.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer eyJhbGciOi');
    expect(storage.storageStatus()).toBe('supabase (last upload failed: HTTP 401)');
  });
});
