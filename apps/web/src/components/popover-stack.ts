const closers: (() => void)[] = [];

export function bindPopover(close: () => void): () => void {
  closers.push(close);
  return () => {
    const index = closers.lastIndexOf(close);
    if (index >= 0) {
      closers.splice(index, 1);
    }
  };
}

/** Closes only the top popover. Returns false when none is open. */
export function dismissPopover(): boolean {
  const close = closers.pop();
  if (close === undefined) {
    return false;
  }
  close();
  return true;
}
