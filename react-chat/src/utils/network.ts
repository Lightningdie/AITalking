export function checkOnline(): boolean {
  return navigator.onLine;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
