import { Controller, Get, Param } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
} from "@nestjs/swagger"
import { AlertsService } from "./alerts.service"

export class AlertDto {
  @ApiProperty({ example: "tcl:12345" })
  alertId!: string

  @ApiProperty({ isArray: true, type: String, example: ["tcl:C3"] })
  routeIds!: string[]

  @ApiProperty({ enum: ["severe", "warning", "info"] })
  level!: "severe" | "warning" | "info"

  @ApiProperty({ example: "Travaux sur les voies" })
  header!: string

  @ApiProperty()
  description!: string

  @ApiProperty({
    description: "The short line a display shows",
    example: "Travaux sur les voies : la ligne C3 est déviée.",
  })
  text!: string

  @ApiProperty({ nullable: true, type: Number })
  activeUntil!: number | null
}

export class AlertsDto {
  @ApiProperty({ isArray: true, type: AlertDto })
  alerts!: AlertDto[]
}

@Controller("alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get(":routeIds")
  @ApiOperation({
    description: "Active service alerts (disruptions) for a list of routes",
  })
  @ApiOkResponse({ type: AlertsDto })
  @ApiBadRequestResponse()
  @ApiParam({
    name: "routeIds",
    description: "A semicolon-separated list of route IDs",
    example: "tcl:C3;tcl:T1",
  })
  getAlerts(@Param("routeIds") routeIdsRaw: string): Promise<AlertsDto> {
    return this.alertsService.getAlerts({
      routeIds: this.alertsService.parseRouteIds(routeIdsRaw),
    })
  }
}
