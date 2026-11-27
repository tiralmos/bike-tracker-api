import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import { displayText } from "src/alerts/alerts.service"
import {
  classifyAlert,
  selectServiceAlerts,
} from "src/modules/feed/modules/gtfs/service-alerts"

const fr = (text: string) => ({ translation: [{ text, language: "fr" }] })
const NOW = new Date(1795000000 * 1000)

describe("classifyAlert", () => {
  const unknown = {
    effect: GtfsRt.Alert.Effect.UNKNOWN_EFFECT,
    severityLevel: null,
  }

  it("uses the severity level first", () => {
    expect(
      classifyAlert(
        {
          effect: GtfsRt.Alert.Effect.NO_SERVICE,
          severityLevel: GtfsRt.Alert.SeverityLevel.INFO,
        },
        "",
        "",
      ),
    ).toBe("info")
  })

  it("uses the effect when there is no severity", () => {
    expect(
      classifyAlert({ effect: GtfsRt.Alert.Effect.NO_SERVICE }, "", ""),
    ).toBe("severe")
    expect(classifyAlert({ effect: GtfsRt.Alert.Effect.DETOUR }, "", "")).toBe(
      "warning",
    )
  })

  it("reads the text when the feed says nothing (TCL)", () => {
    expect(
      classifyAlert(unknown, "Interruption", "Le T1 ne circule pas."),
    ).toBe("severe")
    expect(
      classifyAlert(
        unknown,
        "Déviation",
        "Arrêt Saxe-Préfecture non desservi.",
      ),
    ).toBe("warning")
    expect(
      classifyAlert(unknown, "Travaux", "Fermeture à 22h du 1er au 5/12."),
    ).toBe("info")
  })
})

describe("selectServiceAlerts", () => {
  const entity = (
    id: string,
    routeIds: string[],
    activePeriod: GtfsRt.ITimeRange[] = [],
  ): GtfsRt.IFeedEntity => ({
    id,
    alert: {
      informedEntity: routeIds.map((routeId) => ({ routeId })),
      activePeriod,
      headerText: fr("Travaux sur les voies"),
      descriptionText: fr("La ligne C3 est déviée. Plus d'infos sur tcl.fr."),
    },
  })

  it("keeps active alerts for the routes asked for", () => {
    const alerts = selectServiceAlerts(
      [
        entity("1", ["C3", "C13"]),
        entity("2", ["T1"]),
        entity("3", ["C3"], [{ start: 1795000000 + 3600 }]),
        entity("4", ["C3"], [{ start: 1, end: 1795000000 + 60 }]),
      ],
      ["C3"],
      NOW,
    )

    expect(alerts.map((a) => a.alertId)).toEqual(["1", "4"])
    expect(alerts[0]).toMatchObject({
      routeIds: ["C3"],
      header: "Travaux sur les voies",
      level: "warning",
      activeUntil: null,
    })
    expect(alerts[1].activeUntil).toEqual(new Date((1795000000 + 60) * 1000))
  })
})

describe("displayText", () => {
  it("joins the title and the first sentence", () => {
    expect(
      displayText(
        "Travaux sur les voies",
        "La ligne C3 est déviée.\nPlus d'infos sur tcl.fr.",
      ),
    ).toBe("Travaux sur les voies : La ligne C3 est déviée.")
  })

  it("does not repeat a title the description starts with", () => {
    expect(displayText("Déviation", "Déviation de la ligne C3.")).toBe(
      "Déviation de la ligne C3.",
    )
  })

  it("uses characters the display font has", () => {
    expect(
      displayText("Info", "L\u2019arrêt \u00abBellecour\u00bb est fermé\u2026"),
    ).toBe('Info : L\'arrêt "Bellecour" est fermé...')
  })

  it("cuts long texts", () => {
    const text = displayText("", "a ".repeat(200))
    expect(text.length).toBeLessThanOrEqual(140)
    expect(text.endsWith("...")).toBe(true)
  })
})
