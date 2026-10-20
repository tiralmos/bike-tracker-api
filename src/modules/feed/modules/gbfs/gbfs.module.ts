import { Module } from "@nestjs/common"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { gbfsApiClientProvider } from "./api-client.provider"
import { GbfsService } from "./gbfs.service"

@Module({
  imports: [FeedCacheModule],
  providers: [gbfsApiClientProvider, GbfsService],
  exports: [GbfsService],
})
export class GbfsModule {}
