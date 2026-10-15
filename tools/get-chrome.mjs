/**
 * Installs the newest Chrome (Chrome for Testing) for the browser tools and
 * points `/opt/pw-browsers/chromium`, the path every tool launches, at it.
 * The tools must test what players run, not the older Chromium the
 * container ships with.
 *
 *   node tools/get-chrome.mjs                 newest Stable
 *   node tools/get-chrome.mjs --milestone=156 newest build of one milestone
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, lstatSync } from 'node:fs';
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

const dir = path.join(os.homedir(), '.cache', 'slay-chrome', version);
const bin = path.join(dir, 'chrome-linux64', 'chrome');
if (!existsSync(bin)) {
  mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'chrome.zip');
  const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/linux64/chrome-linux64.zip`;
  console.log(`downloading Chrome ${version}`);
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', zip, url], { stdio: 'inherit' });
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'inherit' });
  rmSync(zip);
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
