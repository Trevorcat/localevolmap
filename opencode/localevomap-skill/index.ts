/**
 * LocalEvomap 进化助手技能
 * 
 * 在 OpenCode/Claude Code 中使用此技能，可以在编码过程中：
 * 1. 自动搜索已验证的解决方案（胶囊）
 * 2. 获取进化策略建议（基因）
 * 3. 记录新的解决方案
 * 4. 查询历史事件
 */

import type {
  EvomapConfig,
  CapsuleSearchResult,
  GenesListResult,
  EvolutionAssistantResult,
  SearchCapsulesOptions,
  ErrorInfo,
  Capsule,
  Gene
} from './types';
import { normalizeSignal } from '../../types/signal-registry';

const EVOMAP_CONFIG: EvomapConfig = {
  baseUrl: process.env.EVOMAP_BASE_URL || 'http://localhost:3000',
  apiKey: process.env.EVOMAP_API_KEY || 'YOUR_API_KEY',
  minConfidence: 0.7
};

/**
 * 从错误信息提取信号
 */
function extractSignals(errorMessage: string, logs?: unknown[]): string[] {
  const signals = new Set<string>();
  
  // 从错误消息提取
  if (errorMessage) {
    const lowerMsg = errorMessage.toLowerCase();
    
    if (lowerMsg.includes('typeerror')) signals.add('error_type');
    if (lowerMsg.includes('referenceerror')) signals.add('log_error');
    if (lowerMsg.includes('syntaxerror')) signals.add('error_syntax');
    if (lowerMsg.includes('undefined')) signals.add('error_undefined');
    if (lowerMsg.includes('null')) signals.add('error_null');
    if (lowerMsg.includes('timeout')) signals.add('error_timeout');
    if (lowerMsg.includes('permission')) signals.add('error_permission');
    if (lowerMsg.includes('not found')) signals.add('error_not_found');
    if (lowerMsg.includes('failed')) signals.add('user_bug_report');
    if (lowerMsg.includes('slow') || lowerMsg.includes('performance')) signals.add('performance_concern');
  }
  
  // 从日志提取
  if (logs) {
    for (const log of logs) {
      if (log && typeof log === 'object') {
        const logObj = log as Record<string, unknown>;
        if (logObj.error) {
          signals.add('log_error');
          if (typeof logObj.error === 'object' && logObj.error !== null) {
            const errorObj = logObj.error as Record<string, unknown>;
            if (typeof errorObj.message === 'string') {
              const nestedSignals = extractSignals(errorObj.message);
              for (const s of nestedSignals) {
                signals.add(s);
              }
            }
          }
        }
        if (logObj.warning) signals.add('system_error');
        if (logObj.performance) signals.add('performance_concern');
      }
    }
  }
  
  return Array.from(signals)
    .map(signal => normalizeSignal(signal) || signal)
    .filter((signal, index, allSignals) => allSignals.indexOf(signal) === index);
}

/**
 * 搜索匹配的胶囊
 */
async function searchCapsules(
  signals: string[],
  options: SearchCapsulesOptions = {}
): Promise<CapsuleSearchResult> {
  const { minConfidence = EVOMAP_CONFIG.minConfidence, limit = 10 } = options;
  
  const params = new URLSearchParams({
    signals: signals.join(','),
    minConfidence: minConfidence.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(
    `${EVOMAP_CONFIG.baseUrl}/api/v1/capsules/search?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${EVOMAP_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to search capsules: ${response.statusText}`);
  }
  
  return response.json() as Promise<CapsuleSearchResult>;
}

/**
 * 获取相关基因
 */
async function getGenes(category?: string, signals?: string[]): Promise<GenesListResult> {
  if (signals && signals.length > 0) {
    const response = await fetch(`${EVOMAP_CONFIG.baseUrl}/api/v1/genes/select`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EVOMAP_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ signals })
    });

    if (!response.ok) {
      throw new Error(`Failed to select gene: ${response.statusText}`);
    }

    const selected = await response.json() as { selected: Gene; alternatives?: Gene[] };
    return {
      total: selected.selected ? 1 : 0,
      genes: selected.selected ? [selected.selected, ...(selected.alternatives || [])] : []
    } as GenesListResult;
  }

  const params = new URLSearchParams();
  
  if (category) params.append('category', category);
  
  const url = params.toString() 
    ? `${EVOMAP_CONFIG.baseUrl}/api/v1/genes?${params}`
    : `${EVOMAP_CONFIG.baseUrl}/api/v1/genes`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${EVOMAP_CONFIG.apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get genes: ${response.statusText}`);
  }
  
  return response.json() as Promise<GenesListResult>;
}

/**
 * 记录新的解决方案
 */
async function recordSolution(solution: {
  summary: string;
  signals: string[];
  geneId?: string;
  changes: { files: number; lines: number };
  confidence?: number;
}): Promise<Capsule> {
  const capsule: Capsule = {
    type: 'Capsule',
    schema_version: '1.0.0',
    id: `capsule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    trigger: solution.signals,
    gene: solution.geneId || 'auto-generated',
    summary: solution.summary,
    confidence: solution.confidence || 0.7,
    blast_radius: solution.changes,
    outcome: {
      status: 'success',
      score: solution.confidence || 0.7,
      duration_ms: 0
    },
    env_fingerprint: {
      platform: process.platform,
      node_version: process.version,
      working_dir: process.cwd()
    },
    metadata: {
      created_at: new Date().toISOString(),
      source: 'opencode-skill',
      validated: false
    }
  };
  
  const response = await fetch(`${EVOMAP_CONFIG.baseUrl}/api/v1/capsules`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EVOMAP_CONFIG.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(capsule)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to record solution: ${response.statusText}`);
  }
  
  return response.json() as Promise<Capsule>;
}

/**
 * 主助手函数 - 在遇到错误时调用
 */
async function evolutionAssistant(errorInfo: ErrorInfo): Promise<EvolutionAssistantResult | null> {
  console.log('🧬 LocalEvomap Evolution Assistant activated');
  
  // 1. 提取信号
  const signals = extractSignals(errorInfo.message || '', errorInfo.logs);
  console.log('📡 Extracted signals:', signals);
  
  if (signals.length === 0) {
    console.log('⚠️ No signals extracted, cannot search for solutions');
    return null;
  }
  
  // 2. 搜索胶囊
  console.log('🔍 Searching for matching capsules...');
  const capsulesResult = await searchCapsules(signals, { minConfidence: 0.6 });
  
  if (capsulesResult.total > 0) {
    console.log(`✅ Found ${capsulesResult.total} matching capsule(s)`);
    const bestCapsule = capsulesResult.capsules[0];
    
    return {
      type: 'capsule_found',
      capsule: bestCapsule,
      confidence: bestCapsule.confidence,
      message: `Found verified solution: ${bestCapsule.summary}`,
      suggestion: `This solution has ${bestCapsule.confidence * 100}% confidence and was tested with similar signals: ${bestCapsule.trigger.join(', ')}`
    };
  }
  
  // 3. 如果没有胶囊，搜索基因
  console.log('🧬 No capsules found, searching for genes...');
  const category = errorInfo.context === 'performance' ? 'performance' : 'repair';
  const genesResult = await getGenes(category, signals);
  
  if (genesResult.total > 0) {
    console.log(`🧬 Found ${genesResult.total} matching gene(s)`);
    const bestGene = genesResult.genes[0];
    
    return {
      type: 'gene_found',
      gene: bestGene,
      message: `Found evolution strategy: ${bestGene.category}`,
      suggestion: `Use this gene to guide the evolution process. Strategy: ${bestGene.strategy?.join(', ') || 'N/A'}`,
      preconditions: bestGene.preconditions,
      constraints: bestGene.constraints
    };
  }
  
  console.log('⚠️ No matching capsules or genes found');
  return {
    type: 'no_match',
    message: 'No existing solutions found for this error pattern',
    suggestion: 'Consider creating a new gene or manually solving this issue'
  };
}

// 导出所有函数
export {
  extractSignals,
  searchCapsules,
  getGenes,
  recordSolution,
  evolutionAssistant,
  EVOMAP_CONFIG
};

// 默认导出助手函数
export default evolutionAssistant;
