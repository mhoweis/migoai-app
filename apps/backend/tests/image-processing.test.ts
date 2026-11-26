import sharp from 'sharp';
import { MAX_IMAGE_SIDE, processUploadedImage, UnsupportedImageError } from '../src/services/image-processing.service';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#d81b60' } });

describe('processUploadedImage', () => {
  it('removes EXIF data such as GPS position', async () => {
    const photo = await solid(40, 20)
      .jpeg()
      .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 4/1 0/1' } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();

    const out = await processUploadedImage(photo);
    const meta = await sharp(out.data).metadata();
    expect(out.extension).toBe('.jpg');
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it('shrinks large photos to the maximum side, keeping the shape', async () => {
    const out = await processUploadedImage(await solid(4000, 3000).jpeg().toBuffer());
    const meta = await sharp(out.data).metadata();
    expect(meta.width).toBe(MAX_IMAGE_SIDE);
    expect(meta.height).toBe(1536);
  });

  it('keeps PNG, WebP and GIF in their own format', async () => {
    expect((await processUploadedImage(await solid(10, 10).png().toBuffer())).contentType).toBe('image/png');
    expect((await processUploadedImage(await solid(10, 10).webp().toBuffer())).contentType).toBe('image/webp');
    expect((await processUploadedImage(await solid(10, 10).gif().toBuffer())).contentType).toBe('image/gif');
  });

  it('rejects files that are not images, whatever they claim to be', async () => {
    await expect(processUploadedImage(Buffer.from('<html><script>alert(1)</script></html>')))
      .rejects.toBeInstanceOf(UnsupportedImageError);
  });
});

describe('processUploadedImage orientation', () => {
  it('turns sideways phone photos upright before dropping the orientation tag', async () => {
    const sideways = await solid(40, 20).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(sideways).metadata()).orientation).toBe(6);
    const meta = await sharp((await processUploadedImage(sideways)).data).metadata();
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(meta.orientation).toBeUndefined();
  });
});

describe('processUploadedImage refuses formats we never accept', () => {
  it.each([
    ['TIFF', () => solid(4, 4).tiff().toBuffer()],
    ['SVG', async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')],
  ])('%s is refused before decoding', async (_name, make) => {
    const file = await make();
    // The decoder itself must refuse (importing the service installs the block),
    // not just our format check after the file has already been decoded.
    await expect(sharp(file).metadata()).rejects.toThrow(/unsupported image format/);
    await expect(processUploadedImage(file)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('recognises an iPhone HEIC photo from its header', async () => {
    const heicHeader = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(32)]);
    await expect(processUploadedImage(heicHeader)).rejects.toThrow('heif');
  });
});
