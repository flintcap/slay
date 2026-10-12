/**
 * SLAY — work put off until the screen is showing play.
 *
 * `scene:change` fires just before the loading curtain fades out. Work that
 * may cost a long frame but does not need to be ready the moment play begins
 * (a figure for a closed panel, icons for a closed pack) waits for the fade
 * to finish and then for the browser's idle time, so it neither keeps the
 * curtain down nor lands on a frame that is busy drawing.
 */

type IdleFn = (cb: () => void, o?: { timeout: number }) => number;

/** Runs `fn` once the curtain has lifted and the browser is idle. */
export function afterCurtain(fn: () => void, delayMs = 900): void {
  setTimeout(() => {
    const idle = (globalThis as { requestIdleCallback?: IdleFn }).requestIdleCallback;
    if (idle) idle(fn, { timeout: 2000 });
    else fn();
  }, delayMs);
}
