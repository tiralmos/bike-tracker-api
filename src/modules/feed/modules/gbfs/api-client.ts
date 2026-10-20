export interface GbfsResponse<T> {
  last_updated: number
  ttl: number
  version?: string
  data: T
}

export interface GbfsDiscovery {
  [language: string]: {
    feeds: { name: string; url: string }[]
  }
}

export interface GbfsStationInformation {
  station_id: string
  name: string
  lat: number
  lon: number
  address?: string
  short_name?: string
  capacity?: number
}

export interface GbfsStationStatus {
  station_id: string
  num_bikes_available: number
  /** Not part of the standard, but published by some GBFS 1.x systems. */
  num_ebikes_available?: number
  vehicle_types_available?: { vehicle_type_id: string; count: number }[]
  num_docks_available?: number
  is_installed: boolean | number
  is_renting: boolean | number
  is_returning: boolean | number
  last_reported?: number
}

export interface GbfsVehicleType {
  vehicle_type_id: string
  form_factor: string
  propulsion_type: string
  name?: string
}

export class GbfsApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class GbfsApiClient {
  constructor(
    readonly discoveryUrl: string,
    private readonly language?: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  /** Returns the URL of each feed listed in `gbfs.json`, keyed by feed name. */
  async getFeedUrls(): Promise<Record<string, string>> {
    const discovery = await this.fetchJson<GbfsDiscovery>(this.discoveryUrl)
    const languages = Object.keys(discovery.data)
    const language = this.language ?? languages[0]
    const feeds = discovery.data[language]?.feeds
    if (!feeds) {
      throw new GbfsApiError(
        `GBFS feed has no "${language}" language; available: ${languages.join(", ")}`,
      )
    }

    return Object.fromEntries(feeds.map((feed) => [feed.name, feed.url]))
  }

  async fetchJson<T>(url: string): Promise<GbfsResponse<T>> {
    const response = await fetch(url, { headers: this.headers })
    if (!response.ok) {
      throw new GbfsApiError(
        `GBFS request to ${url} failed: ${response.status} ${response.statusText}`,
      )
    }
    return response.json() as Promise<GbfsResponse<T>>
  }
}
