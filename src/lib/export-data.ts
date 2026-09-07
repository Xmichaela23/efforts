/**
 * Download your data — the client half of docs/WORKORDER-menu-and-export-2026-09-07.md §2.
 *
 * `buildExport` calls the export-data edge function with the athlete's own JWT and gets back a signed URL
 * good for one hour. `saveExport` hands that file over: on iOS the zip is fetched, written to the app's
 * cache and offered to the share sheet (Capacitor Share); on the web the signed URL already carries a
 * content-disposition (the function signs it with `download`), so a plain navigation saves the file.
 */
import { Capacitor } from '@capacitor/core';
import { invokeFunction } from '@/lib/supabase';

export type ExportBuild = { url: string; filename: string; expires_in: number; counts?: Record<string, number> };

export async function buildExport(): Promise<ExportBuild> {
  const { data, error } = await invokeFunction<ExportBuild>('export-data', {});
  if (error || !data?.url) throw new Error(error?.message || 'The file did not build.');
  return data;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.readAsDataURL(blob);
  });
}

/** Resolves once the share sheet has closed (iOS) or the download has been started (web). */
export async function saveExport(build: ExportBuild): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const res = await fetch(build.url);
    if (!res.ok) throw new Error('The link has expired. Build the file again.');
    const data = await blobToBase64(await res.blob());
    const written = await Filesystem.writeFile({ path: build.filename, data, directory: Directory.Cache });
    await Share.share({ title: build.filename, url: written.uri });
    return;
  }
  const a = document.createElement('a');
  a.href = build.url;
  a.download = build.filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
