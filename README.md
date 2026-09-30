<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/AtfastrSlushyMaker/AtlasMesh/main/client/public/logo.svg" width="80" alt="AtlasMesh Logo" />
  </picture>
</p>

<h1 align="center">AtlasMesh</h1>

<p align="center">
  <strong>Live Earth data on a 3D globe, plus an evidence-first public-source investigation workspace</strong>
</p>

<p align="center">
  <a href="https://atlasmesh.onrender.com"><img src="https://img.shields.io/badge/🌐_Live-atlasmesh.onrender.com-00ffaa?style=flat-square" alt="Deployed" /></a>
  <img src="https://img.shields.io/badge/React-18-38bdf8?style=flat-square&logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/CesiumJS-1.10-22d3ee?style=flat-square" alt="CesiumJS" />
  <img src="https://img.shields.io/badge/Node.js-20-10b981?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-818cf8?style=flat-square&logo=typescript" alt="TypeScript" />
</p>

---

## What it does

**Globe.** Twenty-one public data layers on a CesiumJS globe: aircraft, ships, satellites, Starlink, the ISS, launches, fireballs, earthquakes, GDACS disaster alerts, NASA natural events and storm tracks, fire hotspots, volcanoes, city weather, ocean buoys, public traffic and weather cameras, subsea cables, internet exchanges, airports, power plants, wind farms and meteorite landings. Imagery overlays add place names, rain radar, yesterday's MODIS imagery, city lights and day/night shading.

**Intel.** Start from a person, username, email, organisation, domain, web page, repository, package or DOI. AtlasMesh queries permitted public sources, extracts entities and relationships, links identities with stated reasons, and builds a graph in which every node and edge points to its evidence. An AI analyst answers questions about the graph with citations, and a report generator writes the findings up.

Real sources only. No mock data; when a feed is down the Feeds panel says why.

---

## Quick start

```bash
git clone https://github.com/AtfastrSlushyMaker/AtlasMesh.git
cd AtlasMesh
npm install
cp .env.example .env   # optional; every key is optional
```

```bash
npm run start:server   # API + WebSocket on :3000
npm run start:client   # Vite on :5173 (proxies /api to :3000)
```

Production: `npm run build && npm start` serves the client and API on one port.

### Optional keys

Add them in the app under **Settings → API keys** (each key can be tested before saving; they're stored in `server/data/settings.json`), or put them in `.env`, which takes precedence. Settings can be changed from the machine running the server, or from anywhere once `OSINT_ACCESS_KEY` is set.


| Variable | Unlocks |
|---|---|
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | Aircraft every minute instead of every ~15 minutes |
| `AISSTREAM_TOKEN` | Live ships |
| `DEEPSEEK_API_KEY` | Free-form AI analyst and report summaries (rules-based analyst otherwise). `LLM_BASE_URL` / `LLM_MODEL` switch to any OpenAI-compatible provider |
| `GITHUB_TOKEN`, `STACKEXCHANGE_KEY`, `S2_API_KEY`, `CERTSPOTTER_TOKEN` | Higher connector rate limits |
| `OSINT_ACCESS_KEY` | Requires a key to use the Intel workspace. Set this on any public deployment |
| `OSINT_DATA_DIR` | Where investigations are saved (default `server/data/osint`) |

---

## Globe

| Moving now | Hazards | Space | Observation | Infrastructure | Historical |
|:--|:--|:--|:--|:--|:--|
| Aircraft | Earthquakes | ISS | City weather | Subsea cables | Meteorite landings |
| Ships | Disaster alerts | Satellites | Ocean buoys | Internet exchanges | |
| | Natural events | Starlink | Public cameras | Airports | |
| | Fire hotspots | Launches | | Power plants | |
| | Volcanoes | Fireballs | | Wind farms | |

- **Search** (`⌘K` or `/`): callsigns, ICAO/IATA/MMSI/NORAD ids, camera names, places (OpenStreetMap via Photon) and commands.
- **Inspector**: per-layer facts with units, live camera stills and TfL clips, what else is within 75 km, fly-to, copy coordinates, link to the source record. Organisations and domains can be handed to Intel.
- **Activity**: strong earthquakes, orange/red disaster alerts, launches in the next three days and active storms, ranked.
- **Feeds**: live/stale/failing/needs-setup status per source, with the reason.
- Aircraft, ships and satellites move between updates (dead reckoning and SGP4 orbits), sampled so Cesium interpolates without per-frame JavaScript.

### Cameras

Only feeds that agencies publish for public viewing: [TfL JamCams](https://api.tfl.gov.uk), [Caltrans CCTV](https://cwwp2.dot.ca.gov/) and [Fintraffic weather cameras](https://www.digitraffic.fi/en/road-traffic/) (CC BY 4.0). Directories of unsecured private cameras are deliberately not used.

---

## Intel workspace

```
starting point ─► connectors ─► ingestion ─► normalization ─► entity resolution
                                                   │                 │
                                  evidence store ◄─┴─► graph ◄──────┘
                                                   │
                           confidence · contradictions · timeline · paths
                                                   │
                                   AI analyst · report · workspace UI
```

- **Evidence first.** Every node attribute and every edge keeps source URL, platform, retrieval time, excerpt, method, source reliability and the date the fact refers to.
- **FACT / INFERENCE / HYPOTHESIS.** A source stating a relationship is a fact; engine-derived links are inferences; name-search candidates and handle matches are hypotheses. Line style in the graph shows which.
- **Explainable confidence.** Scores are the sum of named signals (direct statement, source reliability, independent sources, self-reported only, contradictions, age, analyst review). The relationship inspector lists each one.
- **Entity resolution without silent merges.** People are keyed to the source that named them. The resolver compares identity clusters on cross-links, shared public email, shared website or domain, distinctive usernames across platforms, shared repositories, names, affiliations and declared location, then proposes `SAME_ENTITY_AS` or `POSSIBLY_SAME_ENTITY_AS` with a sentence explaining why.
- **Contradictions** (two current employers from different sources, differing locations, one email for different names) keep both sides and say whether dates explain them.
- **Controlled discovery.** Expand one entity at a time with chosen sources. Deeper runs follow only strong links and stop at the depth, entity and request limits you set.
- **Workspace.** Filter by type, source, claim and confidence; pin, hide, collapse, annotate; verify, reject or mark links uncertain; shift-select two entities for the strongest or shortest evidence path; timeline by year; Markdown report with every source URL.
- **AI analyst.** DeepSeek with tool calls over the graph (search, entity detail, paths, identity links, weak claims, contradictions, timeline, next steps). It must cite `[N:…]`, `[E:…]`, `[V:…]` ids, which are validated before display and rendered as clickable footnotes.

### Connectors

| Connector | Source | Expands |
|---|---|---|
| GitHub | REST API | accounts, organisations, repositories, contributors, linked profiles |
| GitLab | REST API | accounts, projects |
| Hugging Face | Hub API | accounts, organisations, models |
| Stack Overflow | Stack Exchange API | accounts, name candidates |
| npm, PyPI, Docker Hub | registry APIs | maintainers, packages, images, declared repositories |
| ORCID | public API | researcher records, dated employment and education, works |
| Crossref | REST API | DOI authors with ORCID, affiliations, venues |
| arXiv, Semantic Scholar | public APIs | papers and co-authors (name matches are hypotheses) |
| Wikidata | API | organisations: website, founding date, HQ coordinates (exact matches only) |
| Public website | one page, robots.txt honoured | title, meta, `rel="me"`, schema.org `sameAs`/`worksFor`, profile links, published contact emails |
| DNS | DNS-over-HTTPS | A/AAAA/NS, mail and SaaS providers from MX/SPF/TXT |
| RDAP | rdap.org | registrar and dates (registrant contacts ignored) |
| Certificate Transparency | Cert Spotter | subdomains and issuing CAs |

A connector is one file implementing `Connector` in `server/osint/connectors/` plus one line in `connectors/index.ts`.

### Boundaries

Official APIs and public pages only; no login walls, paywalls, CAPTCHAs or private systems. Every outbound request is SSRF-checked on each redirect hop. robots.txt is honoured for websites. Phone numbers and street addresses are stripped from stored text and never become entities; locations stay at the level a profile declares; RDAP registrant data is dropped. The analyst refuses to infer sensitive traits. Intended for professional, research, security and journalistic work.

---

## API

| Method | Path | |
|---|---|---|
| `GET` | `/health`, `/metrics` | status |
| `GET` | `/api/sources` | feed health |
| `GET` | `/api/entities?type=&limit=` · `/api/entities/:id` | current entities |
| `GET` | `/api/near?lat=&lon=&radiusKm=&types=` | nearest entities |
| `WS` | `/` | send `{"type":"subscribe","layers":[…]}`; receive snapshots and diffs for those layers |
| | `/api/osint/…` | investigations, seeds, expansion jobs, reviews, notes, timeline, path, insights, ask, report, export |

---

## Layout

```
client/src/
  globe/      viewer, imagery, layer renderers, entity index
  shell/      rail, drawers, inspector, command palette, toasts
  intel/      investigation workspace (graph, details, analyst dock)
  lib/        layer registry, live feed, formatting, API
server/
  sources/    one adapter per feed
  services/   entity store (snapshot/stream retention), source registry
  osint/      connectors, ingest, normalize, resolve, confidence, analysis,
              orchestrator, analyst, report, safety, repository, routes
  lib/        shared HTTP client with disk cache
shared/       entity and OSINT types
```

---

## Keyboard

`⌘K` or `/` search · `⌘,` settings · `L` layers · `F` feeds · `A` activity · `I` Intel · `G` globe · `+` `−` zoom · `H` whole Earth · `Esc` close · `?` help

---

## Data credits

OpenSky Network · AISStream · Celestrak · wheretheiss.at · The Space Devs · NASA JPL CNEOS · USGS · GDACS · NASA EONET · NASA FIRMS · Smithsonian GVP · Open-Meteo · NOAA NDBC · Transport for London · Caltrans · Fintraffic · TeleGeography · PeeringDB · OpenFlights · WRI Global Power Plant Database · Meteoritical Society · Esri · RainViewer · NASA GIBS · Photon/OpenStreetMap

<p align="center">
  <sub>Built by <a href="https://github.com/AtfastrSlushyMaker">AtfastrSlushyMaker</a></sub>
</p>
