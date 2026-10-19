// Checks how many trips in a GTFS-RT Trip Updates feed match a trip in the
// imported static GTFS. Real-time times are only shown for trips that match.
//
// Usage (inside the API container):
//   node scripts/check-rt-trip-match.mjs <feedCode> <tripUpdatesUrl>

import GtfsRealtimeBindings from "gtfs-realtime-bindings"
import pg from "pg"

const [feedCode, url] = process.argv.slice(2)
if (!feedCode || !url) {
  console.error(
    "Usage: node scripts/check-rt-trip-match.mjs <feedCode> <tripUpdatesUrl>",
  )
  process.exit(2)
}

const resp = await fetch(url)
if (!resp.ok) {
  console.error(`GET ${url} failed: HTTP ${resp.status}`)
  process.exit(1)
}

const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
  new Uint8Array(await resp.arrayBuffer()),
)
const tripIds = [
  ...new Set(
    feed.entity.map((e) => e.tripUpdate?.trip?.tripId).filter((id) => !!id),
  ),
]

if (tripIds.length === 0) {
  console.log(
    "The real-time feed has no trip updates yet. Wait a minute and try again.",
  )
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const { rows } = await client.query(
  "SELECT trip_id FROM trips WHERE feed_code = $1 AND trip_id = ANY($2)",
  [feedCode, tripIds],
)
await client.end()

const matched = new Set(rows.map((r) => r.trip_id))
const unmatched = tripIds.filter((id) => !matched.has(id))

console.log(
  `${matched.size} of ${tripIds.length} real-time trips match the static timetable.`,
)
if (unmatched.length > 0) {
  console.log(
    `Examples of unmatched trip IDs: ${unmatched.slice(0, 5).join(", ")}`,
  )
}
process.exit(matched.size > 0 ? 0 : 1)
