# Project audit — 13 October 2026

The current source, README, archived second-brain analysis, and public Render endpoints were reviewed. The second-brain graph analysis describes an older architecture and a satellite fallback that the current implementation no longer uses.

## Deployment finding requiring rollout

The live service returned `mode: full` from `/api/config`, and `/api/osint/access` returned `required: false`, `ok: true`, `showcase: false`. This contradicts the README's intended public showcase and permits unauthenticated Intel requests.

The fix defaults Render to showcase automatically. Full mode on Render now requires both `ATLAS_MODE=full` and an access key. Render supplies the `RENDER=true` marker automatically ([Render environment documentation](https://render.com/docs/environment-variables)). **These source changes have not been deployed.** Setting `ATLAS_MODE=showcase` in the existing service and deploying the fixes closes the current exposure.

## Fixed problems

- Build dependencies were missing locally, the lockfile was ignored, and deploys could resolve different versions. The lockfile is now tracked, Render/Docker use `npm ci --include=dev` for builds, Node 24 is declared, and client builds include TypeScript checking.
- `npm start` did not serve the built client in a normal local shell without `NODE_ENV`. Startup now defaults to production.
- Dependency advisories were resolved, including Axios, WebSockets, Vite, CSV parsing and Express's query parser. The obsolete development watcher was replaced. An override keeps Express 4 on the patched query parser.
- Weather observation times depended on the host timezone; airport CSV parsing broke on quoted commas; ISS outages published an obsolete orbit. These now preserve actual source data and timestamps.
- PeeringDB exchanges lack their own coordinates. Exchanges now map to a real associated public facility, with attribution and an explanation in the inspector. Live verification mapped 917 exchanges; 412 had no usable associated coordinates and were omitted.
- Feed errors were hidden after successful updates, stale caches were treated as newly retrieved, and camera provider failures discarded useful previous data. Failures now remain visible and existing real observations are retained where available.
- OpenSky credential changes reused old tokens; incomplete credential pairs enabled the wrong polling mode. AIS stop/reconnect handling and unavailable coordinates were corrected.
- Slow WebSocket clients could accumulate unlimited queued data. Their connections now terminate at a bounded buffer so reconnects obtain a new snapshot.
- Stationary observations retained old timestamps. Geographic queries now reject invalid coordinates, limits and radii.
- Settings exposed configured previews to public visitors, accepted foreign browser origins locally, and changed active keys before persistence succeeded. These behaviors are corrected.
- Investigation deletion could delete unrelated files or be undone by pending writes/discovery jobs. Deletion cancels those paths, and graceful shutdown stops sources and flushes pending saves.
- Private-network checks missed IPv4-mapped/expanded IPv6 and robots/API redirects. All Intel HTTP requests validate destinations, pin validated DNS results, and apply cancellation/request budgets to redirects and robots requests.
- Imagery toggles raced asynchronous loads; viewer teardown left stale state; reconnect snapshots leaked orbital/search records. These lifecycles are corrected, radar refreshes periodically, and selected graphics follow replacements.
- Intel access failures no longer unlock the interface, and old investigation requests cannot overwrite a newly selected case. Header clipping and local setup instructions were also corrected.

## Verification and limits

- Clean dependency install from the lockfile, server build, client typecheck, and production client build verified locally.
- All 43 deterministic regressions pass, covering feed failures, imagery races, HTTP/WebSocket subscriptions, built Cesium assets, settings access/persistence, investigation deletion, Render defaults and outbound request boundaries.
- The dependency audit reports zero known advisories for the installed tree.
- Browser smoke testing showed live globe data, working showcase guidance and no browser console warnings/errors. Provider outages remain possible; failures are reported instead of simulated data.
- CI runs the build/regressions and builds, scans and health-checks the Docker image. GitHub successfully built the first image; its scan identified Debian and bundled npm vulnerabilities. The follow-up updates Node/Debian and removes unused runtime package managers, while retaining the scan gate. Local Docker execution was unavailable because its daemon was not running; the revised image still needs GitHub verification.
- No production deployment, Git push or external account configuration change was performed. Existing full hosted workspaces need persistent storage and an access key; the showcase only caches public datasets. Deployment and rollback checks are documented in the README ([Render rollback documentation](https://render.com/docs/deploys)).

## Credential and demo follow-up

A scan of the 33 reachable commits (597 text blobs) found no actual credential matches; the sole candidate was an intentionally fabricated access key in a regression test. A scan of 188 built client assets found no matches for the known configured Atlas credentials. Only the empty `.env.example` is tracked; local settings files and `.env` files are ignored and excluded from the Docker context. This scan does not cover Render's private dashboard, historical server logs, or unreachable Git objects.

The live server still reported full mode and returned a masked last-four preview for `AISSTREAM_TOKEN` when checked after the first push. No full secret value appeared in the public settings response. Current code removes all previews for unauthorized/demo callers; the live instance needs to apply the update.

The public demo's Settings now show only General, Globe & map, and About & data. Credential and Intel forms stay unmounted while configuration is pending or fails, and appear only after the server explicitly confirms full mode. Local copies retain API-key setup. Public feed errors, key-test responses and server warnings redact configured credentials, and cross-origin redirects strip API-key headers.
