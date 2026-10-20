import { BadRequestException, Injectable } from "@nestjs/common"
import * as Sentry from "@sentry/node"
import ms from "ms"
import { InjectPinoLogger, PinoLogger } from "nestjs-pino"
import {
  concat,
  defer,
  distinctUntilChanged,
  exhaustMap,
  finalize,
  from,
  Observable,
  share,
  timer,
} from "rxjs"
import { FeedService } from "src/modules/feed/feed.service"
import type { FeedProvider } from "src/modules/feed/interfaces/feed-provider.interface"

export const MAX_STATIONS = 25

export interface StationUpdateEntry {
  stationId: string
  name: string
  capacity: number | null
  docksAvailable: number
  mechanicalBikesAvailable: number
  electricBikesAvailable: number
  isInstalled: boolean
  isRenting: boolean
  isReturning: boolean
  lastReported: number | null
}

export interface StationsUpdate {
  stations: StationUpdateEntry[]
}

export interface StationListEntry {
  stationId: string
  name: string
  lat: number
  lon: number
}

export interface StationsOptions {
  feedCode?: string
  stationIds: string[]
}

@Injectable()
export class StationsService {
  constructor(
    private readonly feedService: FeedService,
    @InjectPinoLogger(StationsService.name)
    private readonly logger: PinoLogger,
  ) {}

  parseStationIds(stationIdsRaw: string): string[] {
    const stationIds = stationIdsRaw
      .split(";")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)

    if (stationIds.length === 0) {
      throw new BadRequestException("At least one station ID is required")
    }

    if (stationIds.length > MAX_STATIONS) {
      throw new BadRequestException(
        `Too many stations; maximum ${MAX_STATIONS}`,
      )
    }

    return stationIds
  }

  private getFeedProvider(options: StationsOptions): FeedProvider {
    if (options.feedCode) {
      const provider = this.feedService.getFeedProvider(options.feedCode)
      if (!provider) {
        throw new BadRequestException("Invalid feed code")
      }

      return provider
    }

    return this.feedService.all
  }

  /** Every bike-share station across all feeds, for station pickers. */
  async listStations(): Promise<StationListEntry[]> {
    const providers = Object.entries(this.feedService.getAllFeedProviders())
    const stations = await Promise.all(
      providers
        .filter(
          ([, provider]) => provider.getStationStatuses && provider.listStops,
        )
        .map(async ([feedCode, provider]) => {
          const stops = await provider.listStops!()
          return stops.map((stop) => ({
            stationId: `${feedCode}:${stop.stopId}`,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
          }))
        }),
    )

    return stations.flat()
  }

  async getStations(options: StationsOptions): Promise<StationsUpdate> {
    const provider = this.getFeedProvider(options)
    if (!provider.getStationStatuses) {
      throw new BadRequestException("This feed has no bike-share stations")
    }

    const statuses = await provider.getStationStatuses(options.stationIds)
    return {
      stations: statuses.map((status) => ({
        stationId: status.stationId,
        name: status.name,
        capacity: status.capacity,
        docksAvailable: status.docksAvailable,
        mechanicalBikesAvailable: status.mechanicalBikesAvailable,
        electricBikesAvailable: status.electricBikesAvailable,
        isInstalled: status.isInstalled,
        isRenting: status.isRenting,
        isReturning: status.isReturning,
        lastReported: status.lastReported
          ? new Date(status.lastReported).getTime() / 1000
          : null,
      })),
    }
  }

  subscribeToStations(
    options: StationsOptions,
    isolationScope?: Sentry.Scope,
  ): Observable<StationsUpdate> {
    return defer(() => {
      this.logger.trace({ options }, "Subscribed to station updates")

      const initialDelay = Math.floor(Math.random() * 10000)
      const jitter = Math.floor(Math.random() * 5000)
      const period = ms("30s") + jitter

      const getStations$ = defer(() =>
        Sentry.withIsolationScope(isolationScope, () =>
          from(this.getStations(options)),
        ),
      )

      return concat(
        getStations$,
        timer(initialDelay, period).pipe(exhaustMap(() => getStations$)),
      ).pipe(
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr),
        ),
        finalize(() =>
          this.logger.trace({ options }, "Unsubscribed from station updates"),
        ),
      )
    }).pipe(share())
  }
}
