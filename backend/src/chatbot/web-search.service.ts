import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly serpApiKey: string;

  constructor(private configService: ConfigService) {
    this.serpApiKey = this.configService.get<string>('SERP_API_KEY') || '';
  }

  /**
   * Search using SerpAPI
   */
  async search(query: string, numResults = 5): Promise<SearchResult[]> {
    if (!this.serpApiKey) {
      this.logger.warn('SERP_API_KEY not configured, skipping web search');
      return [];
    }

    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          api_key: this.serpApiKey,
          num: numResults,
          hl: 'th',
          gl: 'th',
        },
        timeout: 10000,
      });

      const organicResults = response.data?.organic_results || [];
      return organicResults.slice(0, numResults).map((r: Record<string, string>) => ({
        title: r.title || '',
        snippet: r.snippet || '',
        link: r.link || '',
      }));
    } catch (error) {
      this.logger.error('SerpAPI search failed:', error);
      return [];
    }
  }

  /**
   * Search for game recommendations and format for AI context
   */
  async searchGameRecommendations(query: string): Promise<string> {
    const results = await this.search(`${query} เกมสล็อต แนะนำ`, 3);
    if (results.length === 0) {
      return 'ไม่พบข้อมูลจากการค้นหาเว็บ';
    }

    const formatted = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`)
      .join('\n\n');

    return `ข้อมูลจากเว็บ:\n${formatted}`;
  }
}
