import { Module } from "@nestjs/common";

import { StreamBrokerService } from "./stream-broker.service.js";
import { StreamsController } from "./streams.controller.js";

@Module({
  controllers: [StreamsController],
  providers: [StreamBrokerService],
  exports: [StreamBrokerService]
})
export class StreamsModule {}
