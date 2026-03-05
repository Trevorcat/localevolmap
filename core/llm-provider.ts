/**
 * LLM Provider Layer
 * 
 * 统一的 LLM 调用抽象层，支持多模型切换
 * 使用 Vercel AI SDK 的 generateObject 实现结构化输出
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

// ============================================================================
// 结构化输出 Schema（核心契约）
// ============================================================================

/**
 * 单个文件变更
 */
export const EvolutionChangeSchema = z.object({
  file: z.string().describe('相对文件路径，例如 src/index.ts'),
  operation: z.enum(['create', 'modify', 'delete']).describe('操作类型'),
  content: z.string().describe('完整文件内容（非 diff），delete 操作时为空字符串'),
  reasoning: z.string().describe('为什么做此变更，解释修改原因')
});

/**
 * LLM 进化输出
 */
export const EvolutionOutputSchema = z.object({
  changes: z.array(EvolutionChangeSchema).describe('文件变更列表'),
  summary: z.string().describe('本次进化的总体说明'),
  confidence: z.number()
    .min(0)
    .max(1)
    .describe('置信度 (0-1)，基于对问题的理解和解决方案的确定性')
});

export type EvolutionChange = z.infer<typeof EvolutionChangeSchema>;
export type EvolutionOutput = z.infer<typeof EvolutionOutputSchema>;

// ============================================================================
// 配置接口
// ============================================================================

export interface LLMProviderConfig {
  /** LLM 提供商 */
  provider: 'openai' | 'anthropic' | 'local';
  
  /** 模型名称 */
  model: string;
  
  /** API Key（可选，可从环境变量读取） */
  apiKey?: string;
  
  /** 基础 URL（本地模型用，如 Ollama/LM Studio） */
  baseURL?: string;
  
  /** 最大 Token 数 */
  maxTokens?: number;
  
  /** 温度参数（创造性） */
  temperature?: number;
}

// ============================================================================
// LLM Provider 实现
// ============================================================================

export class LLMProvider {
  private model: any;
  
  constructor(private config: LLMProviderConfig) {
    this.model = this.createModel();
  }

  /**
   * 创建模型实例（策略模式）
   */
  private createModel() {
    const apiKey = this.config.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    
    switch (this.config.provider) {
      case 'openai':
        return createOpenAI({ 
          apiKey: apiKey || ''
        })(this.config.model);
        
      case 'anthropic':
        return createAnthropic({ 
          apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '' 
        })(this.config.model);
        
      case 'local':
        // 兼容 Ollama / LM Studio（OpenAI 协议）
        return createOpenAI({
          baseURL: this.config.baseURL || 'http://localhost:11434/v1',
          apiKey: 'local'
        })(this.config.model);
        
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }
  }

  /**
   * 生成进化方案（结构化输出）
   */
  async generateEvolution(prompt: string): Promise<EvolutionOutput> {
    try {
      const { object } = await generateObject({
        model: this.model,
        schema: EvolutionOutputSchema,
        prompt: this.sanitizePrompt(prompt),
        maxOutputTokens: this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0.2,
      });
      
      return object;
    } catch (error) {
      console.error('[LLMProvider] Generation failed:', error);
      throw new Error(`LLM generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Prompt 注入防护：移除控制字符，截断超长输入
   */
  private sanitizePrompt(prompt: string): string {
    // 移除 ASCII 控制字符（除了换行和制表符）
    const sanitized = prompt.split('').filter(char => {
      const code = char.charCodeAt(0);
      // 保留可见字符、空格、换行、制表符
      return code >= 32 || char === '\n' || char === '\r' || char === '\t';
    }).join('');
    
    // 限制过多连续换行
    const limitedNewlines = sanitized.replace(/\n{5,}/g, '\n\n\n');
    
    // 截断超长输入
    return limitedNewlines.slice(0, 32000);
  }

  /**
   * 获取当前配置（用于调试）
   */
  getConfig(): Omit<LLMProviderConfig, 'apiKey'> {
    return {
      provider: this.config.provider,
      model: this.config.model,
      baseURL: this.config.baseURL,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature
    };
  }
}
