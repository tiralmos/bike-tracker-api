import { Controller, Get, Query } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
} from "@nestjs/swagger"
import { WeatherService } from "./weather.service"

export class WeatherDto {
  @ApiProperty({ example: 9 })
  temperature!: number

  @ApiProperty({
    enum: ["clear", "partly", "cloudy", "fog", "rain", "snow", "storm"],
  })
  kind!: string

  @ApiProperty({ example: 61 })
  weatherCode!: number

  @ApiProperty()
  isDay!: boolean

  @ApiProperty({ example: 1795000000 })
  observedAt!: number
}

@Controller("weather")
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  @ApiOperation({
    description: "Current weather at a place, from Open-Meteo",
  })
  @ApiOkResponse({ type: WeatherDto })
  @ApiBadRequestResponse()
  @ApiQuery({ name: "lat", example: 45.7578 })
  @ApiQuery({ name: "lon", example: 4.832 })
  getWeather(
    @Query("lat") lat: string,
    @Query("lon") lon: string,
  ): Promise<WeatherDto> {
    return this.weatherService.getWeather(
      this.weatherService.parseLocation(lat, lon),
    )
  }
}
