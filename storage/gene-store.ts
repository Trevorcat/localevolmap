/**
 * Gene Store - 基因持久化存储
 * 
 * 使用文件系统存储基因数据
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Gene } from '../types/gene-capsule-schema';
import { matchPatternToSignals } from '../core/gene-selector';

export class GeneStore {
  constructor(private basePath: string) {}
  
  /**
   * 初始化存储目录
   */
  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }
  
  /**
   * 获取单个基因
   */
  async get(id: string): Promise<Gene | undefined> {
    try {
      const filePath = path.join(this.basePath, `${this.sanitizeId(id)}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Gene;
    } catch (error) {
      if (error instanceof Error && (error.message.includes('ENOENT'))) {
        return undefined;
      }
      throw error;
    }
  }
  
  /**
   * 获取所有基因
   */
  async getAll(): Promise<Gene[]> {
    try {
      const files = await fs.readdir(this.basePath);
      const genes: Gene[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = path.basename(file, '.json');
          const gene = await this.get(id);
          if (gene) {
            genes.push(gene);
          }
        }
      }
      
      return genes;
    } catch (error) {
      console.error('Failed to read gene store:', error);
      return [];
    }
  }
  
  /**
   * 添加基因
   */
  async add(gene: Gene): Promise<void> {
    const filePath = path.join(this.basePath, `${this.sanitizeId(gene.id)}.json`);
    const content = JSON.stringify(gene, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }
  
  /**
   * 更新基因
   */
  async update(gene: Gene): Promise<void> {
    await this.add(gene);
  }
  
  /**
   * 更新或插入基因 (upsert)
   * 如果基因已存在则更新，否则新增
   */
  async upsert(gene: Gene): Promise<void> {
    const existing = await this.get(gene.id);
    if (existing) {
      // 保留软删除标记，合并更新
      const merged = { ...existing, ...gene };
      await this.add(merged);
    } else {
      await this.add(gene);
    }
  }
  
  /**
   * 删除基因
   */
  async remove(id: string): Promise<void> {
    try {
      const filePath = path.join(this.basePath, `${this.sanitizeId(id)}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      if (!(error instanceof Error && (error.message.includes('ENOENT')))) {
        throw error;
      }
    }
  }
  
  /**
   * 按类别查询
   */
  async getByCategory(category: string): Promise<Gene[]> {
    const genes = await this.getAll();
    return genes.filter(g => g.category === category);
  }
  
  /**
   * 按信号查询
   */
  async getBySignal(signal: string): Promise<Gene[]> {
    const genes = await this.getAll();
    return genes.filter(g => 
      g.signals_match.some(pattern => 
        matchPatternToSignals(pattern, [signal])
      )
    );
  }
  
  /**
   * 清理 ID 中的非法字符
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
}
