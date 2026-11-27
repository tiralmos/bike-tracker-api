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
import type { AlertLevel } from "src/modules/feed/interfaces/feed-provider.interface"

export const MAX_ALERT_ROUTES = 25
/** Longest text sent to a display, so that one scroll stays short. */
export const MAX_ALERT_TEXT_LENGTH = 140

export interface AlertEntry {
  alertId: string
  routeIds: string[]
  level: AlertLevel
  header: string
  description: string
  /** What a display shows: the title, plus the first sentence when it adds something */
  text: string
  activeUntil: number | null
}

export interface AlertsUpdate {
  alerts: AlertEntry[]
}

export interface AlertsOptions {
  routeIds: string[]
}

const LEVEL_ORDER: Record<AlertLevel, number> = {
  severe: 0,
  warning: 1,
  info: 2,
}

/** Title and first sentence of the description, in one short line. */
export function displayText(header: string, description: string): string {
  // Plain characters only: the display font has no curly quotes or dashes
  const flatten = (text: string) =>
    text
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u00ab\u00bb\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/\s+/g, " ")
      .trim()
  const title = flatten(header)
  const firstSentence = flatten(description).match(/^.*?[.!?](\s|$)/)?.[0]
  const sentence = flatten(firstSentence ?? description)

  let text = title
  if (!title) {
    text = sentence
  } else if (
    sentence &&
    !sentence.toLowerCase().startsWith(title.toLowerCase())
  ) {
    text = `${title} : ${sentence}`
  } else if (sentence) {
    text = sentence
  }

  if (text.length > MAX_ALERT_TEXT_LENGTH) {
    text = `${text.slice(0, MAX_ALERT_TEXT_LENGTH - 3).trimEnd()}...`
  }
  return text
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly feedService: FeedService,
    @InjectPinoLogger(AlertsService.name)
    private readonly logger: PinoLogger,
  ) {}

  parseRouteIds(routeIdsRaw: string): string[] {
    const routeIds = [
      ...new Set(
        routeIdsRaw
          .split(";")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    ]

    if (routeIds.length === 0) {
      throw new BadRequestException("At least one route ID is required")
    }

    if (routeIds.length > MAX_ALERT_ROUTES) {
      throw new BadRequestException(
        `Too many routes; maximum ${MAX_ALERT_ROUTES}`,
      )
    }

    return routeIds
  }

  async getAlerts(options: AlertsOptions): Promise<AlertsUpdate> {
    const alerts = await this.feedService.all.getServiceAlerts!(
      options.routeIds,
    )

    return {
      alerts: alerts
        .map((alert) => ({
          alertId: alert.alertId,
          routeIds: [...alert.routeIds],
          level: alert.level,
          header: alert.header,
          description: alert.description,
          text: displayText(alert.header, alert.description),
          activeUntil: alert.activeUntil
            ? Math.floor(new Date(alert.activeUntil).getTime() / 1000)
            : null,
        }))
        .sort(
          (a, b) =>
            LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
            a.alertId.localeCompare(b.alertId),
        ),
    }
  }

  subscribeToAlerts(
    options: AlertsOptions,
    isolationScope?: Sentry.Scope,
  ): Observable<AlertsUpdate> {
    return defer(() => {
      this.logger.trace({ options }, "Subscribed to alert updates")

      const getAlerts$ = defer(() =>
        Sentry.withIsolationScope(isolationScope, () =>
          from(this.getAlerts(options)),
        ),
      )

      const period = ms("60s") + Math.floor(Math.random() * 10000)
      return concat(
        getAlerts$,
        timer(period, period).pipe(exhaustMap(() => getAlerts$)),
      ).pipe(
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr),
        ),
        finalize(() =>
          this.logger.trace({ options }, "Unsubscribed from alert updates"),
        ),
      )
    }).pipe(share())
  }
}
