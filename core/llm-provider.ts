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
   * 通用文本生成（用于蒸馏等非结构化输出场景）
   *
   * 与 generateEvolution 不同，此方法不强制结构化 schema，
   * 直接返回 LLM 的原始文本响应，由调用方自行解析。
   */
  async generateText(prompt: string): Promise<{ text: string }> {
    const sanitizedPrompt = this.sanitizePrompt(prompt);

    if (this.config.provider === 'local') {
      return this.generateTextLocal(sanitizedPrompt);
    }

    return this.generateTextSDK(sanitizedPrompt);
  }

  private async generateTextSDK(prompt: string): Promise<{ text: string }> {
    const { generateText: aiGenerateText } = await import('ai');
    try {
      const result = await aiGenerateText({
        model: this.model,
        prompt,
        maxOutputTokens: this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0.3,
      });
      return { text: result.text };
    } catch (error) {
      throw new Error(`LLM text generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async generateTextLocal(prompt: string): Promise<{ text: string }> {
    const baseURL = this.config.baseURL || 'http://localhost:11434/v1';
    const apiKey = this.config.apiKey || process.env.LLM_API_KEY || 'local';
    const url = `${baseURL}/chat/completions`;

    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You are a gene synthesis engine. Return ONLY a valid JSON object, no markdown wrapping.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.3,
      stream: true,
      chat_template_kwargs: { enable_thinking: false },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const rawContent = await this.collectStreamResponse(response);
    if (!rawContent) {
      throw new Error('LLM returned empty content');
    }
    return { text: rawContent };
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
      // 某些 API（如 Codex）要求 stream=true；
      // 对于不要求的（SGLang/vLLM），stream 也是兼容的
      stream: true,
      // SGLang + Qwen3.5: 关闭 thinking mode
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
      
      // 收集流式 SSE 响应，拼接完整 content
      const rawContent = await this.collectStreamResponse(response);
      
      if (!rawContent) {
        throw new Error('LLM returned null content (thinking mode may still be active)');
      }
      
      // 从 LLM 输出中提取 JSON
      // 某些模型（如 Codex 5.3）即使要求 json_object 也会在前后加 markdown 文本
      const jsonStr = this.extractJson(rawContent);
      
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
   * 收集流式 SSE 响应，拼接完整 content
   * 
   * 兼容两种流式格式：
   * 1. 标准 SSE（data: {JSON}\n\n）
   * 2. 非流式 JSON 响应（某些 API 即使设了 stream=true 也可能返回非流式）
   */
  private async collectStreamResponse(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') || '';
    
    // 如果返回的是普通 JSON（非流式），直接解析
    if (contentType.includes('application/json')) {
      const data = await response.json() as any;
      const message = data?.choices?.[0]?.message;
      if (!message) throw new Error('No message in LLM response');
      return message.content || message.reasoning_content || '';
    }
    
    // 流式 SSE 解析
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream in response');
    
    const decoder = new TextDecoder();
    let contentParts: string[] = [];
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // 按行解析 SSE
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的最后一行
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        
        try {
          const chunk = JSON.parse(trimmed.slice(6));
          const delta = chunk?.choices?.[0]?.delta;
          if (delta?.content) {
            contentParts.push(delta.content);
          }
          // fallback: 某些模型把内容放在 reasoning_content
          if (delta?.reasoning_content) {
            contentParts.push(delta.reasoning_content);
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
    
    const fullContent = contentParts.join('');
    if (!fullContent) {
      throw new Error('LLM stream returned empty content');
    }
    
    return fullContent;
  }

  /**
   * 从 LLM 输出中提取 JSON 对象
   * 
   * 处理常见情况：
   * 1. 纯 JSON 输出
   * 2. markdown 代码块包裹的 JSON
   * 3. 前后有文本描述的 JSON（如 Codex 5.3 的行为）
   */
  private extractJson(raw: string): string {
    const trimmed = raw.trim();
    
    // Case 1: 已经是合法 JSON
    if (trimmed.startsWith('{')) {
      // 找到最后一个匹配的 }
      let depth = 0;
      let endIdx = -1;
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '{') depth++;
        else if (trimmed[i] === '}') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      if (endIdx > 0) return trimmed.slice(0, endIdx + 1);
      return trimmed;
    }
    
    // Case 2: markdown 代码块
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();
    
    // Case 3: 前面有文本描述，找第一个 { 开始的 JSON 对象
    const firstBrace = trimmed.indexOf('{');
    if (firstBrace >= 0) {
      const fromBrace = trimmed.slice(firstBrace);
      let depth = 0;
      let endIdx = -1;
      for (let i = 0; i < fromBrace.length; i++) {
        if (fromBrace[i] === '{') depth++;
        else if (fromBrace[i] === '}') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      if (endIdx > 0) return fromBrace.slice(0, endIdx + 1);
      return fromBrace;
    }
    
    // 无法提取，返回原始内容让调用者报错
    return trimmed;
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
