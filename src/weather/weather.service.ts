import { BadRequestException, Injectable } from "@nestjs/common"
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
import { env } from "src/env"

/** The icons a display can draw. */
export type WeatherKind =
  "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm"

export interface WeatherUpdate {
  /** Rounded to the degree, Celsius */
  temperature: number
  kind: WeatherKind
  /** The WMO weather code Open-Meteo returned */
  weatherCode: number
  isDay: boolean
  /** When Open-Meteo measured it, in Unix time */
  observedAt: number
}

export interface WeatherOptions {
  latitude: number
  longitude: number
}

/** WMO weather interpretation codes, as Open-Meteo documents them. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "clear"
  if (code === 2) return "partly"
  if (code === 3) return "cloudy"
  if (code === 45 || code === 48) return "fog"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  if (code >= 95) return "storm"
  if (code >= 51 && code <= 82) return "rain"
  return "cloudy"
}

interface OpenMeteoResponse {
  current?: {
    time?: number
    temperature_2m?: number
    weather_code?: number
    is_day?: number
  }
}

@Injectable()
export class WeatherService {
  // Weather changes slowly and Open-Meteo is free: ask once per place every
  // 10 minutes, whatever the number of displays.
  private readonly cache = new Map<
    string,
    { at: number; value: Promise<WeatherUpdate> }
  >()

  private readonly baseUrl = env.string(
    "OPEN_METEO_URL",
    "https://api.open-meteo.com/v1/forecast",
  )!

  private readonly maxAgeMs = env.duration("WEATHER_CACHE_TTL", ms("10m"))

  constructor(
    @InjectPinoLogger(WeatherService.name)
    private readonly logger: PinoLogger,
  ) {}

  parseLocation(latitude: unknown, longitude: unknown): WeatherOptions {
    const lat = Number(latitude)
    const lon = Number(longitude)
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      throw new BadRequestException("Invalid latitude or longitude")
    }
    return { latitude: lat, longitude: lon }
  }

  getWeather(options: WeatherOptions): Promise<WeatherUpdate> {
    // About 1 km precision: nearby displays share one request
    const latitude = Math.round(options.latitude * 100) / 100
    const longitude = Math.round(options.longitude * 100) / 100
    const key = `${latitude},${longitude}`

    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.at < this.maxAgeMs) {
      return cached.value
    }

    const value = this.fetchWeather(latitude, longitude)
    this.cache.set(key, { at: Date.now(), value })
    value.catch(() => this.cache.delete(key))
    return value
  }

  private async fetchWeather(
    latitude: number,
    longitude: number,
  ): Promise<WeatherUpdate> {
    const url = new URL(this.baseUrl)
    url.searchParams.set("latitude", String(latitude))
    url.searchParams.set("longitude", String(longitude))
    url.searchParams.set("current", "temperature_2m,weather_code,is_day")
    url.searchParams.set("timeformat", "unixtime")

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Transit Tracker API" },
    })
    if (!resp.ok) {
      throw new Error(`Open-Meteo answered ${resp.status} ${resp.statusText}`)
    }

    const body = (await resp.json()) as OpenMeteoResponse
    const current = body.current
    if (
      typeof current?.temperature_2m !== "number" ||
      typeof current.weather_code !== "number"
    ) {
      throw new Error("Open-Meteo returned no current weather")
    }

    return {
      temperature: Math.round(current.temperature_2m),
      kind: weatherKind(current.weather_code),
      weatherCode: current.weather_code,
      isDay: current.is_day !== 0,
      observedAt: current.time ?? Math.floor(Date.now() / 1000),
    }
  }

  subscribeToWeather(options: WeatherOptions): Observable<WeatherUpdate> {
    return defer(() => {
      this.logger.trace({ options }, "Subscribed to weather updates")

      const getWeather$ = defer(() => from(this.getWeather(options)))
      const period = ms("5m")
      return concat(
        getWeather$,
        timer(period, period).pipe(exhaustMap(() => getWeather$)),
      ).pipe(
        distinctUntilChanged(
          (prev, curr) =>
            prev.temperature === curr.temperature && prev.kind === curr.kind,
        ),
        finalize(() =>
          this.logger.trace({ options }, "Unsubscribed from weather updates"),
        ),
      )
    }).pipe(share())
  }
}
