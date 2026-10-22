export function playFocusSound(
  name: string,
  volume: number,
  loop = false,
): HTMLAudioElement | null {
  if (!['bell', 'chime', 'digital', 'tick', 'rain', 'white_noise'].includes(name)) return null;
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.volume = Math.max(0, Math.min(1, volume / 100));
  audio.loop = loop;
  void audio.play().catch(() => {
    /* Browser autoplay restrictions leave the timer running. */
  });
  return audio;
}
