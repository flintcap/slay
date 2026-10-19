/**
 * Installs the newest Chrome (Chrome for Testing) for the browser tools and
 * points `/opt/pw-browsers/chromium`, the path every tool launches, at it.
 * The tools must test what players run, not the older Chromium the
 * container ships with.
 *
 *   node tools/get-chrome.mjs                 newest Stable
 *   node tools/get-chrome.mjs --milestone=156 newest build of one milestone
 *
 * On a Mac (the automatic checks' real-GPU smoke test, .github/workflows)
 * it fetches the Mac build and names it in CHROME_PATH instead.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, symlinkSync, lstatSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = 'https://googlechromelabs.github.io/chrome-for-testing';

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

let version;
if (args.milestone) {
  const d = await json(`${BASE}/latest-versions-per-milestone.json`);
  version = d.milestones[args.milestone]?.version;
  if (!version) throw new Error(`no build for milestone ${args.milestone}`);
} else {
  const d = await json(`${BASE}/last-known-good-versions.json`);
  version = d.channels.Stable.version;
}

const mac = process.platform === 'darwin';
const plat = mac ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64') : 'linux64';
const dir = path.join(os.homedir(), '.cache', 'slay-chrome', version);
const bin = mac
  ? path.join(dir, `chrome-${plat}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
  : path.join(dir, 'chrome-linux64', 'chrome');
if (!existsSync(bin)) {
  mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'chrome.zip');
  const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${plat}/chrome-${plat}.zip`;
  console.log(`downloading Chrome ${version}`);
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', zip, url], { stdio: 'inherit' });
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'inherit' });
  rmSync(zip);
}

// A Mac app finds its frameworks next to the real binary, so it cannot be
// started through a link: the tools take its path from CHROME_PATH instead,
// and in the automatic checks that is set for the steps after this one.
if (mac) {
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `CHROME_PATH=${bin}\n`);
  console.log(execFileSync(bin, ['--version']).toString().trim(), '->', `CHROME_PATH=${bin}`);
  process.exit(0);
}

const link = '/opt/pw-browsers/chromium';
try {
  if (lstatSync(link)) rmSync(link);
} catch {
  /* no link yet */
}
mkdirSync(path.dirname(link), { recursive: true });
symlinkSync(bin, link);
console.log(execFileSync(link, ['--version']).toString().trim(), '->', link);
