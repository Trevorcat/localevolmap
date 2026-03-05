/**
 * Event Logger - 事件审计日志
 * 
 * 记录所有进化事件，用于审计和回溯
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { EvolutionEvent } from '../types/gene-capsule-schema';

export class EventLogger {
  private logFile: string;
  
  constructor(private basePath: string) {
    this.logFile = path.join(this.basePath, 'events.jsonl');
  }
  
  /**
   * 初始化日志目录
   */
  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    
    // 创建日志文件（如果不存在）
    try {
      await fs.access(this.logFile);
    } catch {
      await fs.writeFile(this.logFile, '', 'utf-8');
    }
  }
  
  /**
   * 追加事件
   */
  async append(event: EvolutionEvent): Promise<void> {
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(this.logFile, line, 'utf-8');
  }
  
  /**
   * 批量追加事件
   */
  async appendMany(events: EvolutionEvent[]): Promise<void> {
    const lines = events.map(e => JSON.stringify(e) + '\n').join('');
    await fs.appendFile(this.logFile, lines, 'utf-8');
  }
  
  /**
   * 获取所有事件
   */
  async getAll(): Promise<EvolutionEvent[]> {
    try {
      const content = await fs.readFile(this.logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);
      
      return lines.map(line => {
        try {
          return JSON.parse(line) as EvolutionEvent;
        } catch {
          return null;
        }
      }).filter((e): e is EvolutionEvent => e !== null);
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return [];
      }
      throw error;
    }
  }
  
  /**
   * 按会话获取事件
   */
  async getBySession(sessionId: string): Promise<EvolutionEvent[]> {
    const events = await this.getAll();
    return events.filter(e => e.metadata?.session_id === sessionId);
  }
  
  /**
   * 获取最近 N 个事件
   */
  async getRecent(count: number = 10): Promise<EvolutionEvent[]> {
    const events = await this.getAll();
    return events.slice(-count);
  }
  
  /**
   * 按基因 ID 查询
   */
  async getByGene(geneId: string): Promise<EvolutionEvent[]> {
    const events = await this.getAll();
    return events.filter(e => e.selected_gene === geneId);
  }
  
  /**
   * 按状态查询
   */
  async getByStatus(status: string): Promise<EvolutionEvent[]> {
    const events = await this.getAll();
    return events.filter(e => e.outcome.status === status);
  }
  
  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Map<string, number>;
    byGene: Map<string, number>;
    successRate: number;
    avgScore: number;
  }> {
    const events = await this.getAll();
    const byStatus = new Map<string, number>();
    const byGene = new Map<string, number>();
    let successCount = 0;
    let totalScore = 0;
    
    for (const event of events) {
      // 按状态统计
      byStatus.set(event.outcome.status, (byStatus.get(event.outcome.status) || 0) + 1);
      
      // 按基因统计
      byGene.set(event.selected_gene, (byGene.get(event.selected_gene) || 0) + 1);
      
      // 成功率
      if (event.outcome.status === 'success') {
        successCount++;
      }
      
      // 平均分
      totalScore += event.outcome.score;
    }
    
    return {
      total: events.length,
      byStatus,
      byGene,
      successRate: events.length > 0 ? successCount / events.length : 0,
      avgScore: events.length > 0 ? totalScore / events.length : 0
    };
  }
  
  /**
   * 清空日志
   */
  async clear(): Promise<void> {
    await fs.writeFile(this.logFile, '', 'utf-8');
  }
  
  /**
   * 备份日志
   */
  async backup(backupName?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = backupName || `backup-${timestamp}`;
    const backupPath = path.join(this.basePath, `${name}.jsonl`);
    
    const content = await fs.readFile(this.logFile, 'utf-8');
    await fs.writeFile(backupPath, content, 'utf-8');
    
    return backupPath;
  }
}
