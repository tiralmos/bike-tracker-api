import { BadRequestException } from "@nestjs/common"
import { PinoLogger } from "nestjs-pino"
import { firstValueFrom } from "rxjs"
import { FeedService } from "src/modules/feed/feed.service"
import {
  FeedProvider,
  StationStatus,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { StationsService } from "src/stations/stations.service"
import { mock, MockProxy } from "vitest-mock-extended"

const STATUS: StationStatus = {
  stationId: "velov:1024",
  name: "ROUVILLE",
  capacity: 17,
  docksAvailable: 5,
  bikesAvailable: 11,
  mechanicalBikesAvailable: 3,
  electricBikesAvailable: 8,
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: new Date(1792479326 * 1000),
}

describe("StationsService", () => {
  let service: StationsService
  let mockFeedService: MockProxy<FeedService>
  let mockAllProvider: MockProxy<FeedProvider>

  beforeEach(() => {
    mockFeedService = mock<FeedService>()
    mockAllProvider = mock<FeedProvider>()
    ;(mockFeedService as any).all = mockAllProvider
    service = new StationsService(mockFeedService, mock<PinoLogger>())
  })

  describe("parseStationIds", () => {
    it("splits on semicolons and trims", () => {
      expect(service.parseStationIds(" velov:1 ;velov:2;")).toEqual([
        "velov:1",
        "velov:2",
      ])
    })

    it("rejects an empty list", () => {
      expect(() => service.parseStationIds(" ; ")).toThrow(BadRequestException)
    })

    it("rejects more than 25 stations", () => {
      const ids = Array.from({ length: 26 }, (_, i) => `velov:${i}`).join(";")
      expect(() => service.parseStationIds(ids)).toThrow(BadRequestException)
    })
  })

  describe("getStations", () => {
    it("returns statuses with Unix timestamps", async () => {
      mockAllProvider.getStationStatuses = vi.fn().mockResolvedValue([STATUS])

      const update = await service.getStations({ stationIds: ["velov:1024"] })

      expect(mockAllProvider.getStationStatuses).toHaveBeenCalledWith([
        "velov:1024",
      ])
      expect(update).toEqual({
        stations: [
          {
            stationId: "velov:1024",
            name: "ROUVILLE",
            capacity: 17,
            docksAvailable: 5,
            mechanicalBikesAvailable: 3,
            electricBikesAvailable: 8,
            isInstalled: true,
            isRenting: true,
            isReturning: true,
            lastReported: 1792479326,
          },
        ],
      })
    })

    it("uses a specific feed when a feed code is given", async () => {
      const mockProvider = mock<FeedProvider>()
      mockProvider.getStationStatuses = vi.fn().mockResolvedValue([])
      mockFeedService.getFeedProvider.mockReturnValue(mockProvider)

      await service.getStations({ feedCode: "velov", stationIds: ["1024"] })

      expect(mockFeedService.getFeedProvider).toHaveBeenCalledWith("velov")
      expect(mockProvider.getStationStatuses).toHaveBeenCalledWith(["1024"])
    })

    it("rejects an unknown feed code", async () => {
      mockFeedService.getFeedProvider.mockReturnValue(undefined)
      await expect(
        service.getStations({ feedCode: "nope", stationIds: ["1"] }),
      ).rejects.toThrow(BadRequestException)
    })

    it("rejects feeds without bike-share stations", async () => {
      const transitProvider = mock<FeedProvider>()
      ;(transitProvider as any).getStationStatuses = undefined
      mockFeedService.getFeedProvider.mockReturnValue(transitProvider)

      await expect(
        service.getStations({ feedCode: "tcl", stationIds: ["1"] }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  it("emits the current statuses as soon as someone subscribes", async () => {
    mockAllProvider.getStationStatuses = vi.fn().mockResolvedValue([STATUS])

    const update = await firstValueFrom(
      service.subscribeToStations({ stationIds: ["velov:1024"] }),
    )

    expect(update.stations[0].electricBikesAvailable).toBe(8)
  })
})
