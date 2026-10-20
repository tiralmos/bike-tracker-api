import { PinoLogger } from "nestjs-pino"
import { StopNotFoundError } from "src/modules/feed/feed.errors"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { FeedCacheService } from "src/modules/feed/modules/feed-cache/feed-cache.service"
import {
  GbfsApiClient,
  GbfsStationInformation,
  GbfsStationStatus,
} from "src/modules/feed/modules/gbfs/api-client"
import { GbfsConfig } from "src/modules/feed/modules/gbfs/config"
import { GbfsService } from "src/modules/feed/modules/gbfs/gbfs.service"
import { mock, MockProxy } from "vitest-mock-extended"

const feedContext: FeedContext<GbfsConfig> = {
  feedCode: "velov",
  config: {
    url: "https://gbfs.example.com/gbfs.json",
    headers: {},
  },
}

const FEED_URLS = {
  station_information: "https://gbfs.example.com/station_information.json",
  station_status: "https://gbfs.example.com/station_status.json",
  vehicle_types: "https://gbfs.example.com/vehicle_types.json",
}

// Trimmed from the Lyon Vélo'v feed (GBFS 2.3)
const STATIONS: GbfsStationInformation[] = [
  {
    station_id: "1024",
    name: "ROUVILLE",
    lat: 45.769684,
    lon: 4.824607,
    address: "PLACE ROUVILLE",
    capacity: 17,
  },
  {
    station_id: "2010",
    name: "CONFLUENCE / DARSE",
    lat: 45.743317,
    lon: 4.815747,
    capacity: 22,
  },
  {
    station_id: "3001",
    name: "",
    lat: 45.76,
    lon: 4.86,
    address: "RUE GARIBALDI",
  },
]

const STATUSES: GbfsStationStatus[] = [
  {
    station_id: "1024",
    num_bikes_available: 11,
    vehicle_types_available: [
      { vehicle_type_id: "mechanical", count: 3 },
      { vehicle_type_id: "electrical", count: 8 },
    ],
    num_docks_available: 5,
    is_installed: true,
    is_renting: true,
    is_returning: true,
    last_reported: 1792479326,
  },
  {
    station_id: "2010",
    num_bikes_available: 0,
    vehicle_types_available: [
      { vehicle_type_id: "mechanical", count: 0 },
      { vehicle_type_id: "electrical", count: 0 },
    ],
    num_docks_available: 22,
    is_installed: true,
    is_renting: false,
    is_returning: true,
    last_reported: 1792479000,
  },
  {
    station_id: "3001",
    num_bikes_available: 4,
    num_ebikes_available: 1,
    num_docks_available: 6,
    is_installed: 1,
    is_renting: 1,
    is_returning: 0,
  },
]

const VEHICLE_TYPES = [
  {
    vehicle_type_id: "mechanical",
    form_factor: "bicycle",
    propulsion_type: "human",
  },
  {
    vehicle_type_id: "electrical",
    form_factor: "bicycle",
    propulsion_type: "electric_assist",
  },
]

function respond<T>(data: T, ttl = 60) {
  return { last_updated: 1792479326, ttl, data }
}

describe("GbfsService", () => {
  let gbfsService: GbfsService
  let mockCacheService: MockProxy<FeedCacheService>
  let mockApiClient: MockProxy<GbfsApiClient>
  let rawCacheResults: Map<string, any>
  let feedUrls: Record<string, string>

  beforeEach(() => {
    mockCacheService = mock<FeedCacheService>()
    mockApiClient = mock<GbfsApiClient>()
    rawCacheResults = new Map()
    feedUrls = { ...FEED_URLS }

    mockCacheService.cached.mockImplementation(async (key, fn) => {
      const result = await fn()
      rawCacheResults.set(key, result)
      if (result instanceof Object && "value" in result && "ttl" in result) {
        return result.value
      }

      return result
    })

    mockApiClient.getFeedUrls.mockImplementation(async () => feedUrls)
    mockApiClient.fetchJson.mockImplementation(async (url: string) => {
      switch (url) {
        case FEED_URLS.station_information:
          return respond({ stations: STATIONS }, 300)
        case FEED_URLS.station_status:
          return respond({ stations: STATUSES }, 1)
        case FEED_URLS.vehicle_types:
          return respond({ vehicle_types: VEHICLE_TYPES }, 3600)
        default:
          throw new Error(`Unexpected URL ${url}`)
      }
    })

    gbfsService = new GbfsService(
      feedContext,
      mockCacheService,
      mockApiClient,
      mock<PinoLogger>(),
    )
  })

  it("validates its config and requires a URL", () => {
    expect(() => GbfsService.validateConfig({})).toThrow()
    expect(
      GbfsService.validateConfig({ url: "https://gbfs.example.com/gbfs.json" }),
    ).toEqual({ url: "https://gbfs.example.com/gbfs.json", headers: {} })
  })

  describe("stops", () => {
    it("lists every station as a stop", async () => {
      const stops = await gbfsService.listStops()

      expect(stops).toEqual([
        {
          stopId: "1024",
          stopCode: null,
          name: "Rouville",
          lat: 45.769684,
          lon: 4.824607,
        },
        {
          stopId: "2010",
          stopCode: null,
          name: "Confluence / Darse",
          lat: 45.743317,
          lon: 4.815747,
        },
        {
          stopId: "3001",
          stopCode: null,
          name: "Rue Garibaldi",
          lat: 45.76,
          lon: 4.86,
        },
      ])
    })

    it("gets a station by its ID", async () => {
      const stop = await gbfsService.getStop("2010")
      expect(stop.name).toBe("Confluence / Darse")
    })

    it("throws StopNotFoundError for an unknown station", async () => {
      await expect(gbfsService.getStop("nope")).rejects.toThrow(
        StopNotFoundError,
      )
    })

    it("finds stations within a bounding box", async () => {
      const stops = await gbfsService.getStopsInArea([4.82, 45.76, 4.83, 45.77])
      expect(stops.map((s) => s.stopId)).toEqual(["1024"])
    })

    it("ignores test stations at 0,0", async () => {
      STATIONS.push({ station_id: "2", name: "", lat: 0, lon: 0 })

      expect(await gbfsService.getAgencyBounds()).toEqual([
        4.815747, 45.743317, 4.86, 45.769684,
      ])
      expect(
        (await gbfsService.listStops()).map((s) => s.stopId),
      ).not.toContain("2")
      STATIONS.pop()
    })

    it("has no routes or trips", async () => {
      expect(await gbfsService.getRoutesForStop()).toEqual([])
      expect(await gbfsService.getUpcomingTripsForRoutesAtStops()).toEqual([])
    })
  })

  describe("getStationStatuses", () => {
    it("splits bikes into mechanical and electric using vehicle types", async () => {
      const [status] = await gbfsService.getStationStatuses(["1024"])

      expect(status).toEqual({
        stationId: "1024",
        name: "Rouville",
        capacity: 17,
        docksAvailable: 5,
        bikesAvailable: 11,
        mechanicalBikesAvailable: 3,
        electricBikesAvailable: 8,
        isInstalled: true,
        isRenting: true,
        isReturning: true,
        lastReported: new Date(1792479326 * 1000),
      })
    })

    it("keeps the requested order and skips unknown stations", async () => {
      const statuses = await gbfsService.getStationStatuses([
        "2010",
        "unknown",
        "1024",
      ])

      expect(statuses.map((s) => s.stationId)).toEqual(["2010", "1024"])
      expect(statuses[0].isRenting).toBe(false)
    })

    it("falls back to num_ebikes_available and numeric booleans (GBFS 1.x)", async () => {
      const [status] = await gbfsService.getStationStatuses(["3001"])

      expect(status).toMatchObject({
        name: "Rue Garibaldi",
        capacity: null,
        mechanicalBikesAvailable: 3,
        electricBikesAvailable: 1,
        isInstalled: true,
        isReturning: false,
        lastReported: null,
      })
    })

    it("guesses electric vehicle types from their ID without vehicle_types.json", async () => {
      delete feedUrls.vehicle_types

      const [status] = await gbfsService.getStationStatuses(["1024"])

      expect(status.mechanicalBikesAvailable).toBe(3)
      expect(status.electricBikesAvailable).toBe(8)
    })

    it("caches station status for at least 30 seconds", async () => {
      await gbfsService.getStationStatuses(["1024"])
      expect(rawCacheResults.get("stationStatus").ttl).toBe(30_000)
    })
  })
})
