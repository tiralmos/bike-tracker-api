import { prettifyStationName } from "src/modules/feed/modules/gbfs/station-name"

describe("prettifyStationName", () => {
  it.each([
    ["SACRE COEUR", "Sacre Coeur"],
    ["PART-DIEU / DERUELLE", "Part-Dieu / Deruelle"],
    ["L'HOMME DE LA ROCHE", "L'Homme de la Roche"],
    ["LES HALLES", "Les Halles"],
    [
      "CITÉ INTERNATIONALE / RÉSIDENCE HÔTELIÈRE",
      "Cité Internationale / Résidence Hôtelière",
    ],
    ["OULLINS - DE GAULLE/ KENNEDY", "Oullins - de Gaulle/ Kennedy"],
    ["PLACE DU 8E", "Place du 8e"],
    ["IUT FEYSSINE", "IUT Feyssine"],
    ["WOOSTOWER 2025", "Woostower 2025"],
  ])("%s -> %s", (input, expected) => {
    expect(prettifyStationName(input)).toBe(expected)
  })

  it("leaves names that already use lowercase letters alone", () => {
    expect(prettifyStationName("Place de la Bourse")).toBe("Place de la Bourse")
  })
})
