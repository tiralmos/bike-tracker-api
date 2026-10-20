import { Inject } from "@nestjs/common"
import { BBox } from "geojson"
import ms from "ms"
import { PinoLogger } from "nestjs-pino"
import type {
  FeedContext,
  FeedProvider,
  StationStatus,
  Stop,
  StopRoute,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { DeepReadonly } from "ts-essentials"
import { RegisterFeedProvider } from "../../decorators/feed-provider.decorator"
import { FEED_CONTEXT } from "../../feed-context"
import { StopNotFoundError } from "../../feed.errors"
import { FeedCacheService } from "../feed-cache/feed-cache.service"
import {
  GbfsApiClient,
  GbfsApiError,
  GbfsStationInformation,
  GbfsStationStatus,
  GbfsVehicleType,
} from "./api-client"
import { GbfsConfig, GbfsConfigSchema } from "./config"
import { prettifyStationName } from "./station-name"

const MIN_STATUS_TTL = ms("30s")
const MAX_STATUS_TTL = ms("2m")

// Used when a feed lists vehicle types per station but has no
// vehicle_types.json to say which of them are electric.
const ELECTRIC_TYPE_ID_PATTERN = /elec|e-?bike|assist/i

function toBoolean(value: boolean | number | undefined): boolean {
  return value === true || value === 1
}

/**
 * Bike-share stations from a GBFS feed (https://gbfs.org). Each station
 * is exposed as a stop; live availability comes from getStationStatuses.
 */
@RegisterFeedProvider("gbfs")
export class GbfsService implements FeedProvider {
  constructor(
    @Inject(FEED_CONTEXT) { feedCode }: FeedContext<GbfsConfig>,
    private readonly cache: FeedCacheService,
    private readonly apiClient: GbfsApiClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(`${GbfsService.name}[${feedCode}]`)
  }

  static validateConfig(config: unknown): GbfsConfig {
    return GbfsConfigSchema.parse(config)
  }

  async healthCheck(): Promise<void> {
    await this.getStationInformation()
  }

  private getFeedUrls() {
    return this.cache.cached(
      "feedUrls",
      () => this.apiClient.getFeedUrls(),
      ms("24h"),
    )
  }

  private async getFeedUrl(name: string): Promise<string | undefined> {
    const urls = await this.getFeedUrls()
    return urls[name]
  }

  private async getStationInformation() {
    return this.cache.cached(
      "stationInformation",
      async () => {
        const url = await this.getFeedUrl("station_information")
        if (!url) {
          throw new GbfsApiError("GBFS feed has no station_information")
        }

        const response = await this.apiClient.fetchJson<{
          stations: GbfsStationInformation[]
        }>(url)
        // Some operators park test stations at 0,0
        return response.data.stations.filter((s) => s.lat !== 0 || s.lon !== 0)
      },
      ms("1h"),
    )
  }

  private async getStationStatus() {
    return this.cache.cached("stationStatus", async () => {
      const url = await this.getFeedUrl("station_status")
      if (!url) {
        throw new GbfsApiError("GBFS feed has no station_status")
      }

      const response = await this.apiClient.fetchJson<{
        stations: GbfsStationStatus[]
      }>(url)

      const ttl = Math.min(
        Math.max((response.ttl ?? 0) * 1000, MIN_STATUS_TTL),
        MAX_STATUS_TTL,
      )
      return { value: response.data.stations, ttl }
    })
  }

  private async getElectricVehicleTypeIds(): Promise<ReadonlySet<string>> {
    const ids = await this.cache.cached(
      "electricVehicleTypeIds",
      async () => {
        const url = await this.getFeedUrl("vehicle_types")
        if (!url) {
          return null
        }

        const response = await this.apiClient.fetchJson<{
          vehicle_types: GbfsVehicleType[]
        }>(url)
        return response.data.vehicle_types
          .filter((type) => type.propulsion_type !== "human")
          .map((type) => type.vehicle_type_id)
      },
      ms("24h"),
    )

    return new Set(ids ?? [])
  }

  private toStop(station: DeepReadonly<GbfsStationInformation>): Stop {
    return {
      stopId: station.station_id,
      stopCode: station.short_name ?? null,
      name: prettifyStationName(
        station.name || station.address || station.station_id,
      ),
      lat: station.lat,
      lon: station.lon,
    }
  }

  async listStops(): Promise<Stop[]> {
    const stations = await this.getStationInformation()
    return stations.map((station) => this.toStop(station))
  }

  async getStop(stopId: string): Promise<Stop> {
    const stations = await this.getStationInformation()
    const station = stations.find((s) => s.station_id === stopId)
    if (!station) {
      throw new StopNotFoundError(stopId)
    }

    return this.toStop(station)
  }

  async getStopsInArea(bbox: BBox): Promise<Stop[]> {
    const [minLon, minLat, maxLon, maxLat] = bbox
    const stations = await this.getStationInformation()
    return stations
      .filter(
        (station) =>
          station.lon >= minLon &&
          station.lon <= maxLon &&
          station.lat >= minLat &&
          station.lat <= maxLat,
      )
      .map((station) => this.toStop(station))
  }

  async getAgencyBounds(): Promise<BBox> {
    const stations = await this.getStationInformation()
    const lons = stations.map((s) => s.lon)
    const lats = stations.map((s) => s.lat)
    return [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ]
  }

  // Bike-share stations have no routes or trips.
  async getRoutesForStop(): Promise<StopRoute[]> {
    return []
  }

  async getUpcomingTripsForRoutesAtStops(): Promise<TripStop[]> {
    return []
  }

  async getStationStatuses(stationIds: string[]): Promise<StationStatus[]> {
    const [information, statuses, electricTypeIds] = await Promise.all([
      this.getStationInformation(),
      this.getStationStatus(),
      this.getElectricVehicleTypeIds(),
    ])

    const isElectric = (vehicleTypeId: string) =>
      electricTypeIds.size > 0
        ? electricTypeIds.has(vehicleTypeId)
        : ELECTRIC_TYPE_ID_PATTERN.test(vehicleTypeId)

    const result: StationStatus[] = []
    for (const stationId of stationIds) {
      const station = information.find((s) => s.station_id === stationId)
      const status = statuses.find((s) => s.station_id === stationId)
      if (!station || !status) {
        this.logger.warn({ stationId }, "Station not found in GBFS feed")
        continue
      }

      let electric: number
      let mechanical: number
      if (status.vehicle_types_available) {
        electric = 0
        mechanical = 0
        for (const {
          vehicle_type_id,
          count,
        } of status.vehicle_types_available) {
          if (isElectric(vehicle_type_id)) {
            electric += count
          } else {
            mechanical += count
          }
        }
      } else {
        electric = status.num_ebikes_available ?? 0
        mechanical = Math.max(status.num_bikes_available - electric, 0)
      }

      result.push({
        stationId,
        name: this.toStop(station).name,
        capacity: station.capacity ?? null,
        docksAvailable: status.num_docks_available ?? 0,
        bikesAvailable: status.num_bikes_available,
        mechanicalBikesAvailable: mechanical,
        electricBikesAvailable: electric,
        isInstalled: toBoolean(status.is_installed),
        isRenting: toBoolean(status.is_renting),
        isReturning: toBoolean(status.is_returning),
        lastReported: status.last_reported
          ? new Date(status.last_reported * 1000)
          : null,
      })
    }

    return result
  }
}
