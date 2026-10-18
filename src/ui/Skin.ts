/**
 * Painted skin: the grey detail maps the frames lay over their plates.
 *
 * Each map is fetched through `fetchAsset` (so it works from the asset pack
 * as well as loose files), turned into a blob URL and published as a CSS
 * custom property on <html>. Stylesheets read it with a fallback,
 * `var(--tex-leather, none)`, so a missing or slow file just leaves the
 * generated grain on its own. Nothing ever waits on these.
 */
import { fetchAsset } from '../core/Assets';

const MAPS: ReadonlyArray<readonly [prop: string, rel: string]> = [
  ['--tex-leather', 'textures/ui/leather.webp'],
  ['--tex-metal', 'textures/ui/scratched-metal.webp'],
];

let started = false;

/** Starts loading the skin once. Safe to call again. */
export function loadUiSkin(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  const root = document.documentElement;
  for (const [prop, rel] of MAPS) {
    fetchAsset(rel)
      .then((buf) => {
        if (!buf) return;
        const url = URL.createObjectURL(new Blob([buf], { type: 'image/webp' }));
        root.style.setProperty(prop, `url("${url}")`);
      })
      .catch(() => {
        /* no skin: the generated grain stays on its own */
      });
  }
}
