import { Controller, Get, Param, UseInterceptors } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
} from "@nestjs/swagger"
import ms from "ms"
import { CacheTTL } from "src/modules/cache/decorators/cache-ttl.decorator"
import { CacheInterceptor } from "src/modules/cache/interceptors/cache.interceptor"
import { StationsService } from "./stations.service"

export class StationDto {
  @ApiProperty({ description: "The ID of the station", example: "velov:1024" })
  stationId!: string

  @ApiProperty({ description: "The name of the station", example: "ROUVILLE" })
  name!: string

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Total number of docks, if known",
    example: 17,
  })
  capacity!: number | null

  @ApiProperty({ description: "Free docks to return a bike", example: 5 })
  docksAvailable!: number

  @ApiProperty({ description: "Mechanical bikes available", example: 3 })
  mechanicalBikesAvailable!: number

  @ApiProperty({ description: "Electric bikes available", example: 8 })
  electricBikesAvailable!: number

  @ApiProperty({ description: "Whether the station is installed" })
  isInstalled!: boolean

  @ApiProperty({ description: "Whether bikes can be taken from the station" })
  isRenting!: boolean

  @ApiProperty({ description: "Whether bikes can be returned to the station" })
  isReturning!: boolean

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "When the station last reported its status, in Unix time",
    example: 1792479326,
  })
  lastReported!: number | null
}

export class StationListEntryDto {
  @ApiProperty({ description: "The ID of the station", example: "velov:1024" })
  stationId!: string

  @ApiProperty({ description: "The name of the station", example: "ROUVILLE" })
  name!: string

  @ApiProperty({ example: 45.769684 })
  lat!: number

  @ApiProperty({ example: 4.824607 })
  lon!: number
}

export class StationsDto {
  @ApiProperty({ isArray: true, type: StationDto })
  stations!: StationDto[]
}

@Controller("stations")
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(ms("1h"))
  @ApiOperation({
    description: "List every bike-share station across all feeds",
  })
  @ApiOkResponse({ type: StationListEntryDto, isArray: true })
  listStations(): Promise<StationListEntryDto[]> {
    return this.stationsService.listStations()
  }

  @Get(":stationIds")
  @ApiOperation({
    description: "Get live availability for a list of bike-share stations",
  })
  @ApiOkResponse({ type: StationsDto })
  @ApiBadRequestResponse()
  @ApiParam({
    name: "stationIds",
    description: "A semicolon-separated list of station IDs",
    example: "velov:1024;velov:2010",
  })
  getStations(
    @Param("stationIds") stationIdsRaw: string,
  ): Promise<StationsDto> {
    return this.stationsService.getStations({
      stationIds: this.stationsService.parseStationIds(stationIdsRaw),
    })
  }
}
