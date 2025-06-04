import { Module } from '@nestjs/common';

import { LeadGenerationService } from './lead-generation.service';

@Module({
  providers: [LeadGenerationService],
  exports: [LeadGenerationService],
})
export class LeadGenerationModule {}
