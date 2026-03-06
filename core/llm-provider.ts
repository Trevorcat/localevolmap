/**
 * LLM Provider Layer
 * 
 * 统一的 LLM 调用抽象层，支持多模型切换
 * - openai/anthropic: 使用 Vercel AI SDK generateObject（tool calling mode）
 * - local (SGLang/vLLM): 直接调用 OpenAI-compatible API + 手动 Zod 校验
 *   原因：Qwen3.5 默认 thinking mode 导致 content:null，SDK 无法透传
 *   chat_template_kwargs 来关闭 thinking
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
    // 只有非 local provider 才创建 AI SDK model 实例
    if (config.provider !== 'local') {
      this.model = this.createModel();
    }
  }

  /**
   * 创建 AI SDK 模型实例（openai/anthropic 用）
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
        
      default:
        throw new Error(`Unsupported provider for AI SDK: ${this.config.provider}`);
    }
  }

  /**
   * 生成进化方案（结构化输出）
   */
  async generateEvolution(prompt: string): Promise<EvolutionOutput> {
    const sanitizedPrompt = this.sanitizePrompt(prompt);
    
    if (this.config.provider === 'local') {
      return this.generateEvolutionLocal(sanitizedPrompt);
    }
    
    return this.generateEvolutionSDK(sanitizedPrompt);
  }

  /**
   * AI SDK 路径（openai/anthropic）
   * 使用 generateObject 的默认 tool calling mode
   */
  private async generateEvolutionSDK(prompt: string): Promise<EvolutionOutput> {
    try {
      const { object } = await generateObject({
        model: this.model,
        schema: EvolutionOutputSchema,
        prompt,
        maxOutputTokens: this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0.2,
      });
      
      return object;
    } catch (error) {
      console.error('[LLMProvider] SDK generation failed:', error);
      throw new Error(`LLM generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 直接 HTTP 路径（local / SGLang / vLLM）
   * 
   * 绕过 AI SDK，直接调用 OpenAI-compatible API：
   * 1. 传 chat_template_kwargs.enable_thinking=false 关闭 Qwen3.5 thinking
   * 2. 传 response_format.type=json_object 启用 JSON mode
   * 3. 用 Zod 手动校验响应
   */
  private async generateEvolutionLocal(prompt: string): Promise<EvolutionOutput> {
    const baseURL = this.config.baseURL || 'http://localhost:11434/v1';
    const apiKey = this.config.apiKey || process.env.LLM_API_KEY || 'local';
    const url = `${baseURL}/chat/completions`;
    
    const schemaHint = `You MUST respond with a valid JSON object matching this schema exactly:
{
  "changes": [
    {
      "file": "relative/path/to/file.ts",
      "operation": "create" | "modify" | "delete",
      "content": "full file content as string",
      "reasoning": "explanation of why this change is needed"
    }
  ],
  "summary": "overall description of the evolution",
  "confidence": 0.0 to 1.0
}

Do NOT wrap in markdown code blocks. Return raw JSON only.`;
    
    const body = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: `You are a code evolution engine. ${schemaHint}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.2,
      response_format: { type: 'json_object' },
      // SGLang + Qwen3.5: 关闭 thinking mode
      // Qwen3.5 默认开启 thinking，会把响应放在 reasoning_content 而非 content，
      // 导致 content:null。通过 chat_template_kwargs 显式关闭。
      chat_template_kwargs: { enable_thinking: false },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
      }
      
      const data = await response.json() as any;
      const message = data?.choices?.[0]?.message;
      
      if (!message) {
        throw new Error('No message in LLM response');
      }
      
      // 优先取 content，fallback 到 reasoning_content（以防 thinking 未被关闭）
      const rawContent = message.content || message.reasoning_content;
      
      if (!rawContent) {
        throw new Error('LLM returned null content (thinking mode may still be active)');
      }
      
      // 清理可能的 markdown 包裹
      const jsonStr = rawContent
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error(`Invalid JSON from LLM: ${jsonStr.slice(0, 200)}...`);
      }
      
      // Zod 校验
      const result = EvolutionOutputSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Schema validation failed: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      
      return result.data;
    } catch (error) {
      console.error('[LLMProvider] Local generation failed:', error);
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
