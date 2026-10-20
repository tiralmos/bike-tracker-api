# GBFS (bike-share) Configuration

The `gbfs` feed provider reads a bike-share system's [GBFS](https://gbfs.org) feed (versions 1.x to 2.3). Each station becomes a stop, so it shows up in the stop search endpoints, and its live availability is available through:

- `GET /stations` — every station of every GBFS feed (ID, name, position)
- `GET /stations/:stationIds` — availability for a `;`-separated list of station IDs, e.g. `velov:1024;velov:7024`
- WebSocket `stations:subscribe` with `{ "stationIds": "velov:1024;velov:7024" }` — sends a `stations` event with the same data whenever it changes (checked about every 30 seconds), plus a `heartbeat` event every 30 seconds

Each station reports its free docks, and its available bikes split into mechanical and electric ones. The split uses `vehicle_types_available` with `vehicle_types.json` (GBFS 2.1+), or the non-standard `num_ebikes_available` field some 1.x feeds publish.

## Example

```yaml
feeds:
  velov:
    name: Vélo'v
    description: Lyon, France
    gbfs:
      # The feed's auto-discovery file
      url: https://download.data.grandlyon.com/files/rdata/jcd_jcdecaux.jcdvelov/gbfs.json
      # Optional: which language's feeds to use (defaults to the first one)
      language: fr
      # Optional: extra HTTP headers, e.g. for feeds that need an API key
      headers:
        Authorization: "Bearer ..."
```

Station status is cached for the feed's `ttl`, but at least 30 seconds and at most 2 minutes; the station list for 1 hour. Stations at coordinates 0,0 (test stations) are ignored.
