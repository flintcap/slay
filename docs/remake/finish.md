# Stream: finish (cleanup, speed, long play test, publish)

Status: not started

Goal: tie the remake together. Nothing old left behind, fast enough, no
crashes, docs true, published.

## Milestones

- [ ] Requests. Do every request other streams left for a stream that has
  finished (search "Notes for resume" in every progress file).
- [ ] Dead code. Find and delete code nothing calls any more, old assets and
  old checkers. `tsc` clean, build clean.
- [ ] Speed. Draw calls (under 900 in town and a busy map), triangles,
  textures, load time, memory, garbage per frame. Fix the worst.
- [ ] Long play test. A headless soak (`check-soak`) through many maps:
  errors, leaks, slowdowns. Fix what it finds.
- [ ] Docs. `CONTRACTS.md`, `CLAUDE.md`, `ASSETS.md` accurate.
- [ ] Publish. Bundle with `node tools/bundle-artifact.mjs` and hand Claude
  the page and the asset file list.

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read every other progress file's Handover section.

## Notes for resume

- The cancelled overhaul's quality stream never took its final speed numbers
  or ran the soak (see `docs/overhaul/quality.md`). Those tools are
  `tools/check-perf.mjs` and `tools/check-soak.mjs`.
