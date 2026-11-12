# ReadyLaPlata v2

Static copy of the public site at https://gis.lpcgov.org/readylpc/index.html, imported November 12, 2026. Serve this directory through any static web server; no build step is required.

## Files

- `index.html`: home page and active incident cards.
- `overview.html`: county overview map, active incident links, historical incident list.
- `evac.html`: selected incident map, zone status cards, and incident resources.
- `zone.html`: exact zone editor copied from `Matthew-Richardson/readylaplata`, source blob `18e227dcaf955fddfe6a5b25c68274a355d6d6c7`.
- `alert.html`: public alert drafting/export tool.
- `shared.js`, `shared-styles.css`, `logo.png`, `favicon.ico`: scripts, styles, and branding.
- `incident.json`, `pastincident.json`, `announcement.json`, `drill-banner.json`: public site content copied from the county host.

The original county site references `favicon.svg`, which returns 404. This copy uses `favicon.ico` from the readylaplata repository instead.

## Public visibility

The public zone service is:

https://services2.arcgis.com/ilLrLpXfElYxSy9y/ArcGIS/rest/services/LPC_Evac_Zones_View/FeatureServer/0

Its numeric visibility field is named `Live`. All active incident lists, zone cards, incident extents, and public zone map layers use `Live = 1`. Resource cards in `evac.html` are displayed only if the selected incident has at least one live zone. Setting every zone in an incident to `Live = 0` or null removes that incident from active lists and hides its resource cards. A mixture of live and inactive zones shows only the live zones.

Public incident lists, zone cards, and resource visibility refresh every 60 seconds. The public zone map layer also refreshes every minute. Zone cards support Go, Set, Shelter, Access, and Planning, matching the editor's choices. The existing branding, colors, and map configuration are retained.

Detailed resource information still comes from `incident.json`, matched by incident name. Updating this JSON remains separate from toggling zone visibility. Announcements and past incidents retain the original site's independent behavior.

## External services and protected files

Maps, basemaps, ArcGIS JavaScript, analytics, fonts, and Regroup signup remain external dependencies. The zone editor retains its existing ArcGIS authentication and web-map configuration.

`staff/editor.html` returns HTTP 401 on the county host and could not be imported. Its existing absolute link remains directed to the county host. Server-side code, protected files, and files not discoverable from the public pages are not included. Copying this repository does not change the county-hosted site or configure hosting for this repository.

## Verification

Run `node --test tests/live-incidents.test.cjs` (Node.js required). Tests cover script parsing, live incident queries, refresh behavior, service errors, all zone card statuses, inactive resource hiding, and active resource rendering.
