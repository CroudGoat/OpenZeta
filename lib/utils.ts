/**
 * Triggers a client-side download of JSON data.
 * Uses a Blob object URL instead of a data: URI so that very large
 * payloads (full backups) do not exhaust browser memory.
 */
export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the click has been processed
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
