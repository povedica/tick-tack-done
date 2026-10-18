/** RF-203. Raster images get a thumbnail. Other files do not. */

const IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isRasterImage(mime: string): boolean {
  return IMAGES.has(mime.toLowerCase().split(';')[0]?.trim() ?? '');
}
