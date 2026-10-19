// Sample ride: embedded gzip+base64 in the single-file build, fetched from data/ in dev.
export async function getSampleBlob() {
  const b64 = globalThis.__EUC_SAMPLE_GZ_B64__;
  if (typeof b64 === 'string') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).blob();
  }
  const res = await fetch('../data/sample.csv');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}
