import { FactoryProvider } from "@nestjs/common"
import { FEED_CONTEXT } from "../../feed-context"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { GbfsApiClient } from "./api-client"
import { GbfsConfig } from "./config"

export const gbfsApiClientProvider: FactoryProvider<GbfsApiClient> = {
  provide: GbfsApiClient,
  inject: [FEED_CONTEXT],
  useFactory: ({ config }: FeedContext<GbfsConfig>) =>
    new GbfsApiClient(config.url, config.language, config.headers),
}
