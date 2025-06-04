import { Injectable } from '@nestjs/common';

import { LLMChatModelService } from 'src/engine/core-modules/llm-chat-model/llm-chat-model.service';

export interface LeadSuggestion {
  customer: string;
  reason: string;
}

@Injectable()
export class LeadGenerationService {
  constructor(private readonly llmChatModelService: LLMChatModelService) {}

  async generateLeads(notes: string[]): Promise<LeadSuggestion[]> {
    const prompt = `Analyze the following CRM notes and past interactions. Identify potential repeat customers or upsell opportunities and return them as a JSON array named leads where each entry has \"customer\" and \"reason\" fields.\n\n${notes.join('\n')}`;

    const chatModel = this.llmChatModelService.getJSONChatModel();
    const result = (await chatModel.invoke(prompt)) as { leads: LeadSuggestion[] };

    return result.leads;
  }
}
