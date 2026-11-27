import { PinoLogger } from "nestjs-pino"
import { WeatherService, weatherKind } from "src/weather/weather.service"
import { mock } from "vitest-mock-extended"

describe("weatherKind", () => {
  it.each([
    [0, "clear"],
    [2, "partly"],
    [3, "cloudy"],
    [45, "fog"],
    [61, "rain"],
    [81, "rain"],
    [73, "snow"],
    [86, "snow"],
    [95, "storm"],
  ])("maps WMO code %i to %s", (code, kind) => {
    expect(weatherKind(code)).toBe(kind)
  })
})

describe("WeatherService", () => {
  afterEach(() => vi.restoreAllMocks())

  it("asks Open-Meteo once per place and rounds the temperature", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          current: {
            time: 1795000000,
            temperature_2m: 8.6,
            weather_code: 61,
            is_day: 0,
          },
        }),
      ),
    )
    const service = new WeatherService(mock<PinoLogger>())

    const first = await service.getWeather({
      latitude: 45.7578,
      longitude: 4.832,
    })
    await service.getWeather({ latitude: 45.7581, longitude: 4.8321 })

    expect(first).toEqual({
      temperature: 9,
      kind: "rain",
      weatherCode: 61,
      isDay: false,
      observedAt: 1795000000,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejects an invalid place", () => {
    const service = new WeatherService(mock<PinoLogger>())
    expect(() => service.parseLocation("abc", "4.8")).toThrow()
    expect(() => service.parseLocation("95", "4.8")).toThrow()
  })
})
