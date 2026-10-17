import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

// Domain modules (tasks, lists, …) register here and do not import each other.
// They will publish and consume events on the bus.
@Module({
  imports: [PrismaModule, HealthModule],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AppModule {}
