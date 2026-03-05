/**
 * Capsule Store - 胶囊持久化存储
 * 
 * 使用文件系统存储胶囊数据
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Capsule, Signal } from '../types/gene-capsule-schema';

export class CapsuleStore {
  constructor(private basePath: string) {}
  
  /**
   * 初始化存储目录
   */
  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }
  
  /**
   * 获取单个胶囊
   */
  async get(id: string): Promise<Capsule | undefined> {
    try {
      const filePath = path.join(this.basePath, `${this.sanitizeId(id)}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Capsule;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return undefined;
      }
      throw error;
    }
  }
  
  /**
   * 获取所有胶囊
   */
  async getAll(): Promise<Capsule[]> {
    try {
      const files = await fs.readdir(this.basePath);
      const capsules: Capsule[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = path.basename(file, '.json');
          const capsule = await this.get(id);
          if (capsule) {
            capsules.push(capsule);
          }
        }
      }
      
      return capsules;
    } catch (error) {
      console.error('Failed to read capsule store:', error);
      return [];
    }
  }
  
  /**
   * 添加胶囊
   */
  async add(capsule: Capsule): Promise<void> {
    // 检查是否已存在
    const existing = await this.get(capsule.id);
    if (existing) {
      console.warn(`Capsule ${capsule.id} already exists, skipping`);
      return;
    }
    
    const filePath = path.join(this.basePath, `${this.sanitizeId(capsule.id)}.json`);
    const content = JSON.stringify(capsule, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }
  
  /**
   * 更新胶囊
   */
  async update(capsule: Capsule): Promise<void> {
    const filePath = path.join(this.basePath, `${this.sanitizeId(capsule.id)}.json`);
    const content = JSON.stringify(capsule, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }
  
  /**
   * 删除胶囊
   */
  async remove(id: string): Promise<void> {
    try {
      const filePath = path.join(this.basePath, `${this.sanitizeId(id)}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('ENOENT'))) {
        throw error;
      }
    }
  }
  
  /**
   * 按信号搜索
   */
  async searchBySignals(signals: Signal[]): Promise<Capsule[]> {
    const capsules = await this.getAll();
    const results: Capsule[] = [];
    
    for (const capsule of capsules) {
      const matchCount = capsule.trigger.filter(t => 
        signals.some(s => s.toLowerCase().includes(t.toLowerCase().split('|')[0].trim()))
      ).length;
      
      if (matchCount > 0) {
        results.push(capsule);
      }
    }
    
    return results.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * 按基因 ID 搜索
   */
  async searchByGene(geneId: string): Promise<Capsule[]> {
    const capsules = await this.getAll();
    return capsules.filter(c => c.gene === geneId);
  }
  
  /**
   * 按状态搜索
   */
  async searchByStatus(status: string): Promise<Capsule[]> {
    const capsules = await this.getAll();
    return capsules.filter(c => c.outcome.status === status);
  }
  
  /**
   * 清理 ID 中的非法字符
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
}
