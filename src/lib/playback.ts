/** Only web streams can be handed to a browser or opened as an external link. */
export function isWebStream(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function preferredStreamIndex(streams: { url: string }[]): number {
  return Math.max(0, streams.findIndex(stream => /^https:\/\//i.test(stream.url)));
}

export function streamProblem(url: string | undefined, pageProtocol: string): string | null {
  if (!url) return 'Cette chaîne ne propose pas de source pour le moment.';
  if (!isWebStream(url)) return 'Ce format de lien ne peut pas être lu dans un navigateur.';
  if (pageProtocol === 'https:' && new URL(url).protocol === 'http:') {
    return 'Cette source utilise HTTP. Votre navigateur bloque sa lecture sur cette page sécurisée. Vous pouvez ouvrir ou copier le lien pour un lecteur externe.';
  }
  return null;
}

/** IPTV URLs sometimes hide the playlist extension behind a query endpoint. */
export function isDirectVideo(url: string): boolean {
  try {
    return /\.(mp4|m4v|webm|ogv|ogg|mov)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
