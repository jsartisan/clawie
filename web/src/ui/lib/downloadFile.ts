/**
 * Triggers a browser download for a remote URL.
 *
 * Cross-origin URLs ignore the anchor `download` attribute unless the server
 * sends `Content-Disposition: attachment`. The backend honors `?download=1`
 * by signing the S3 GET with that header (or sending it directly for local
 * storage), which avoids a cross-origin blob fetch that depended on S3 CORS
 * being open.
 */
export function downloadFile(url: string, filename?: string): void {
  const downloadUrl = url + (url.includes('?') ? '&' : '?') + 'download=1';
  const link = document.createElement('a');
  link.href = downloadUrl;
  if (filename) link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function filenameFromUrl(url: string, fallback = 'image.png'): string {
  try {
    const path = new URL(url, window.location.href).pathname;
    const last = path.split('/').filter(Boolean).pop() || fallback;
    return last.includes('.') ? last : `${last}.png`;
  } catch {
    return fallback;
  }
}
