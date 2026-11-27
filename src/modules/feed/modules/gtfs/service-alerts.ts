import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import type {
  AlertLevel,
  ServiceAlert,
} from "src/modules/feed/interfaces/feed-provider.interface"

const Effect = GtfsRt.Alert.Effect
const SeverityLevel = GtfsRt.Alert.SeverityLevel

/** Words that mean the line does not run (some or all of it). */
const SEVERE_WORDS = [
  "interrompu",
  "interruption",
  "ne circule pas",
  "ne circuleront pas",
  "ne circulera pas",
  "ne circulent pas",
  "suspendu",
  "suspension",
  "aucun service",
  "pas de service",
  "hors service",
  "arret total",
  "no service",
  "suspended",
  "not running",
]

/** Words that mean the line runs, but not as usual. */
const WARNING_WORDS = [
  "devie",
  "deviation",
  "retard",
  "perturb",
  "ralenti",
  "non desservi",
  "ne dessert pas",
  "ne desservira pas",
  "frequence reduite",
  "incident",
  "accident",
  "manifestation",
  "report",
  "detour",
  "delay",
  "disrupt",
]

/** Lower case, without accents, so "Déviation" matches "deviation". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/**
 * How bad an alert is. GTFS-RT severity and effect win when the feed fills
 * them; TCL's feed leaves both unknown, so the text decides otherwise.
 */
export function classifyAlert(
  alert: Pick<GtfsRt.IAlert, "effect" | "severityLevel">,
  header: string,
  description: string,
): AlertLevel {
  switch (alert.severityLevel) {
    case SeverityLevel.SEVERE:
      return "severe"
    case SeverityLevel.WARNING:
      return "warning"
    case SeverityLevel.INFO:
      return "info"
  }

  switch (alert.effect) {
    case Effect.NO_SERVICE:
      return "severe"
    case Effect.REDUCED_SERVICE:
    case Effect.SIGNIFICANT_DELAYS:
    case Effect.DETOUR:
    case Effect.MODIFIED_SERVICE:
    case Effect.STOP_MOVED:
      return "warning"
    case Effect.ADDITIONAL_SERVICE:
    case Effect.NO_EFFECT:
    case Effect.ACCESSIBILITY_ISSUE:
      return "info"
  }

  const text = normalize(`${header}\n${description}`)
  if (SEVERE_WORDS.some((word) => text.includes(word))) return "severe"
  if (WARNING_WORDS.some((word) => text.includes(word))) return "warning"
  return "info"
}

function translated(text: GtfsRt.ITranslatedString | null | undefined) {
  const translations = text?.translation ?? []
  return (
    translations.find((t) => t.language === "fr")?.text ??
    translations[0]?.text ??
    ""
  ).trim()
}

function covers(period: GtfsRt.ITimeRange, nowSeconds: number) {
  const end = Number(period.end ?? 0)
  return (
    Number(period.start ?? 0) <= nowSeconds && (end === 0 || end > nowSeconds)
  )
}

function isActive(alert: GtfsRt.IAlert, nowSeconds: number) {
  const periods = alert.activePeriod ?? []
  return periods.length === 0 || periods.some((p) => covers(p, nowSeconds))
}

function activeUntil(alert: GtfsRt.IAlert, nowSeconds: number): Date | null {
  const period = (alert.activePeriod ?? []).find((p) => covers(p, nowSeconds))
  const end = Number(period?.end ?? 0)
  return end > 0 ? new Date(end * 1000) : null
}

/** The active alerts of a decoded feed that concern any of these routes. */
export function selectServiceAlerts(
  entities: ReadonlyArray<GtfsRt.IFeedEntity>,
  routeIds: string[],
  now: Date,
): ServiceAlert[] {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const wanted = new Set(routeIds)
  const alerts: ServiceAlert[] = []

  for (const entity of entities) {
    const alert = entity.alert
    if (!alert || entity.isDeleted || !isActive(alert, nowSeconds)) continue

    const concerned = [
      ...new Set(
        (alert.informedEntity ?? []).flatMap((informed) =>
          informed.routeId && wanted.has(informed.routeId)
            ? [informed.routeId]
            : [],
        ),
      ),
    ]
    if (concerned.length === 0) continue

    const header = translated(alert.headerText)
    const description = translated(alert.descriptionText)
    alerts.push({
      alertId: entity.id,
      routeIds: concerned,
      header,
      description,
      level: classifyAlert(alert, header, description),
      activeUntil: activeUntil(alert, nowSeconds),
    })
  }

  return alerts
}
