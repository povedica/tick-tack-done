/** Runs inside Chromium; composites translucent CSS backgrounds before measuring contrast. */
export function renderedContrast(node: Element): number {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const rgba = (color: string) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  };
  const blend = (color: number[], bg: number[]) =>
    color.slice(0, 3).map((c, i) => c * (color[3]! / 255) + bg[i]! * (1 - color[3]! / 255));
  const layers: number[][] = [];
  for (let current: Element | null = node; current; current = current.parentElement)
    layers.unshift(rgba(getComputedStyle(current).backgroundColor));
  let background = [255, 255, 255];
  for (const layer of layers) background = blend(layer, background);
  const foreground = blend(rgba(getComputedStyle(node).color), background);
  const luminance = (color: number[]) =>
    color
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i]!, 0);
  const a = luminance(background),
    b = luminance(foreground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
