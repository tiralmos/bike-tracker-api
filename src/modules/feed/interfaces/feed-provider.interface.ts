import { BBox } from "geojson"
import { DeepReadonly } from "ts-essentials"

export interface RouteAtStop {
  routeId: string
  stopId: string
}

export interface TripStop {
  tripId: string
  stopId: string
  routeId: string
  routeName: string
  routeColor: string | null
  stopName: string
  headsign: string
  directionId: string | null
  arrivalTime: Date
  departureTime: Date
  vehicle: string | null
  isRealtime: boolean
}

export interface Stop {
  stopId: string
  stopCode: string | null
  name: string
  lat: number
  lon: number
}

export interface StopRoute {
  routeId: string
  name: string
  color: string | null
  headsigns: readonly string[]
}

export interface StationStatus {
  stationId: string
  name: string
  capacity: number | null
  docksAvailable: number
  bikesAvailable: number
  mechanicalBikesAvailable: number
  electricBikesAvailable: number
  isInstalled: boolean
  isRenting: boolean
  isReturning: boolean
  lastReported: Date | null
}

/** How bad a disruption is: the display colors its alerts with it. */
export type AlertLevel = "severe" | "warning" | "info"

export interface ServiceAlert {
  alertId: string
  /** The routes it concerns, among the ones asked for */
  routeIds: string[]
  /** Short title, e.g. "Travaux sur les voies" */
  header: string
  description: string
  level: AlertLevel
  /** When it stops being active, if known */
  activeUntil: Date | null
}

export interface FeedContext<TConfig = unknown> {
  feedCode: string
  config: TConfig
}

export interface SyncOptions {
  force?: boolean
}

export interface FeedProvider {
  sync?(opts?: SyncOptions): Promise<void>
  getLastSync?(): Promise<Date | null>
  getMetadata?(): Promise<Record<string, any>>

  healthCheck(): Promise<void>

  getUpcomingTripsForRoutesAtStops(routes: RouteAtStop[]): Promise<TripStop[]>

  listStops?(): Promise<ReadonlyArray<DeepReadonly<Stop>>>

  /** @throws {StopNotFoundError} When no stop with that ID exists in the feed. */
  getStop(stopId: string): Promise<DeepReadonly<Stop>>
  getRoutesForStop(
    stopId: string,
  ): Promise<ReadonlyArray<DeepReadonly<StopRoute>>>
  getStopsInArea(bbox: BBox): Promise<ReadonlyArray<DeepReadonly<Stop>>>

  getAgencyBounds?(): Promise<DeepReadonly<BBox>>

  /**
   * Live availability for bike-share stations. Unknown station IDs are
   * left out of the result; the rest keep the order they were asked in.
   */
  getStationStatuses?(
    stationIds: string[],
  ): Promise<ReadonlyArray<DeepReadonly<StationStatus>>>

  /** Active service alerts that concern any of these routes. */
  getServiceAlerts?(
    routeIds: string[],
  ): Promise<ReadonlyArray<DeepReadonly<ServiceAlert>>>
}
