import { EvolutionEngine, type EventLogger, type EvolutionEngineConfig, LLMProviderError } from './evolution-engine';
import { GeneStore } from '../storage/gene-store';
import { CapsuleStore } from '../storage/capsule-store';
import type { EvolutionEvent, Gene } from '../types/gene-capsule-schema';

const mockGenerateEvolution = jest.fn();

jest.mock('./llm-provider', () => ({
  LLMProvider: jest.fn().mockImplementation(() => ({
    generateEvolution: mockGenerateEvolution
  }))
}));

const testGene: Gene = {
  type: 'Gene',
  id: 'gene_test_repair',
  category: 'repair',
  signals_match: ['log_error', 'error_type'],
  preconditions: [],
  strategy: ['fix error'],
  constraints: { max_files: 5, max_lines: 50 }
};

const baseConfig = (overrides: Partial<EvolutionEngineConfig> = {}): EvolutionEngineConfig => ({
  strategy: 'balanced',
  genes_path: './data/genes',
  capsules_path: './data/capsules',
  events_path: './data/events',
  session_scope: 'test-session',
  review_mode: false,
  max_blast_radius: { files: 50, lines: 500 },
  forbidden_paths: ['.git', 'node_modules'],
  selection: {
    driftEnabled: false,
    effectivePopulationSize: 3,
    alternativesCount: 3
  },
  rollbackEnabled: false,
  rollbackStrategy: 'none',
  cacheEnabled: false,
  cacheTtlMs: 1000,
  dryRun: true,
  autoApproveLowRisk: false,
  ...overrides
});

const errorLogs = [
  {
    type: 'tool_result',
    error: { message: 'Type Error: undefined is not a function' },
    timestamp: new Date().toISOString()
  }
];

function createEventLoggerMock() {
  const events: EvolutionEvent[] = [];
  const logger: EventLogger = {
    append: jest.fn(async (event: EvolutionEvent) => {
      events.push(event);
    }),
    getAll: jest.fn(async () => events),
    getBySession: jest.fn(async (sessionId: string) => events.filter(e => e.metadata?.session_id === sessionId)),
    getRecent: jest.fn(async (count: number) => events.slice(-count))
  };
  return { logger, events };
}

function createStores() {
  const capsuleStore = new CapsuleStore('__test_capsule_store__');
  const geneStore = new GeneStore('__test_gene_store__');

  const addSpy = jest.spyOn(capsuleStore, 'add').mockResolvedValue();
  const updateSpy = jest.spyOn(capsuleStore, 'update').mockResolvedValue();
  jest.spyOn(capsuleStore, 'getAll').mockResolvedValue([]);

  const upsertSpy = jest.spyOn(geneStore, 'upsert').mockResolvedValue();
  jest.spyOn(geneStore, 'getAll').mockResolvedValue([]);

  return { capsuleStore, geneStore, addSpy, updateSpy, upsertSpy };
}

describe('EvolutionEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateEvolution.mockReset();
  });

  test('无 LLM 时应返回空变更并记录事件并创建胶囊', async () => {
    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore, addSpy, upsertSpy } = createStores();
    const engine = new EvolutionEngine(baseConfig(), logger, capsuleStore, geneStore);

    const gene = structuredClone(testGene);
    engine.setGenePool([gene]);
    engine.setCapsulePool([]);

    const result = await engine.evolve(errorLogs);

    expect(result.changes).toEqual([]);
    expect(result.event.outcome.status).toBe('success');
    expect(result.capsule_created).toMatch(/^capsule_/);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect((logger.append as jest.Mock).mock.calls.length).toBe(1);
  });

  test('使用 mock LLM 且低风险变更时应通过审批并成功', async () => {
    mockGenerateEvolution.mockResolvedValue({
      changes: [
        {
          file: 'src/fix.ts',
          operation: 'modify',
          content: 'line1\nline2',
          reasoning: 'small safe fix'
        }
      ],
      summary: 'apply small fix',
      confidence: 0.91
    });

    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore } = createStores();
    const engine = new EvolutionEngine(
      baseConfig({ llmProvider: 'local', llmModel: 'mock-model' }),
      logger,
      capsuleStore,
      geneStore
    );
    engine.setGenePool([structuredClone(testGene)]);
    engine.setCapsulePool([]);

    const result = await engine.evolve(errorLogs);

    expect(result.changes).toHaveLength(1);
    expect(result.event.metadata?.blast_radius?.risk_level).toBe('low');
    expect(result.event.outcome.status).toBe('success');
    expect(result.capsule_created).toMatch(/^capsule_/);
  });

  test('LLM 抛错时应抛出 LLMProviderError 并记录失败事件', async () => {
    mockGenerateEvolution.mockRejectedValue(new Error('mock llm failed'));

    const { logger } = createEventLoggerMock();
    const engine = new EvolutionEngine(
      baseConfig({ llmProvider: 'local', llmModel: 'mock-model' }),
      logger
    );
    engine.setGenePool([structuredClone(testGene)]);
    engine.setCapsulePool([]);

    await expect(engine.evolve(errorLogs)).rejects.toBeInstanceOf(LLMProviderError);

    expect((logger.append as jest.Mock).mock.calls.length).toBe(1);
    const errorEvent = (logger.append as jest.Mock).mock.calls[0][0] as EvolutionEvent;
    expect(errorEvent.outcome.status).toBe('failed');
    expect(errorEvent.validation.errors?.[0]).toContain('LLM generation failed: mock llm failed');
  });

  test('无匹配基因时应自动创建 auto-gene 并标记 auto_gene_created', async () => {
    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore, upsertSpy } = createStores();
    const engine = new EvolutionEngine(baseConfig(), logger, capsuleStore, geneStore);

    engine.setGenePool([
      {
        type: 'Gene',
        id: 'gene_unrelated',
        category: 'performance',
        signals_match: ['perf_critical'],
        preconditions: [],
        strategy: ['optimize'],
        constraints: {}
      }
    ]);
    engine.setCapsulePool([]);

    const result = await engine.evolve(errorLogs);

    expect(result.auto_gene_created).toBe(true);
    expect(result.event.selected_gene).toMatch(/^gene_auto_/);
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^gene_auto_/) }));
  });

  test('基因池为空时应抛出 Gene pool is empty（不触发 auto-gene fallback）', async () => {
    const { logger } = createEventLoggerMock();
    const engine = new EvolutionEngine(baseConfig(), logger);
    engine.setGenePool([]);
    engine.setCapsulePool([]);

    await expect(engine.evolve(errorLogs)).rejects.toThrow('Gene pool is empty');
  });

  test('成功进化后应写入 epigenetic 成功标记', async () => {
    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore } = createStores();
    const engine = new EvolutionEngine(baseConfig(), logger, capsuleStore, geneStore);
    const gene = structuredClone(testGene);

    engine.setGenePool([gene]);
    engine.setCapsulePool([]);
    await engine.evolve(errorLogs);

    expect(gene.epigenetic_marks).toHaveLength(1);
    expect(gene.epigenetic_marks?.[0].outcome).toBe('success');
    expect(gene.epigenetic_marks?.[0].boost).toBeGreaterThan(0);
  });

  test('验证失败时应写入 epigenetic 失败标记并不创建胶囊', async () => {
    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore, addSpy } = createStores();
    const engine = new EvolutionEngine(baseConfig(), logger, capsuleStore, geneStore);
    const invalidValidationGene: Gene = {
      ...structuredClone(testGene),
      id: 'gene_invalid_validation',
      validation: ['python unsafe_script.py']
    };

    engine.setGenePool([invalidValidationGene]);
    engine.setCapsulePool([]);
    const result = await engine.evolve(errorLogs);

    expect(result.event.outcome.status).toBe('failed');
    expect(result.capsule_created).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
    expect(invalidValidationGene.epigenetic_marks).toHaveLength(1);
    expect(invalidValidationGene.epigenetic_marks?.[0].outcome).toBe('failed');
    expect(invalidValidationGene.epigenetic_marks?.[0].boost).toBeLessThan(0);
  });

  test('成功创建胶囊时应持久化到 capsuleStore，且字段正确', async () => {
    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore, addSpy } = createStores();
    const engine = new EvolutionEngine(baseConfig(), logger, capsuleStore, geneStore);

    engine.setGenePool([structuredClone(testGene)]);
    engine.setCapsulePool([]);
    await engine.evolve(errorLogs);

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'Capsule',
      gene: 'gene_test_repair',
      outcome: expect.objectContaining({ status: 'success' }),
      blast_radius: expect.objectContaining({ files: 0, lines: 0 })
    }));
  });

  test('每次 evolve 后应 upsert 更新后的 gene', async () => {
    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore, upsertSpy } = createStores();
    const engine = new EvolutionEngine(baseConfig(), logger, capsuleStore, geneStore);
    const gene = structuredClone(testGene);

    engine.setGenePool([gene]);
    engine.setCapsulePool([]);
    await engine.evolve(errorLogs);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: 'gene_test_repair',
      epigenetic_marks: expect.any(Array)
    }));
  });

  test('auto-gene 创建后应持久化并回填到 gene pool', async () => {
    const { logger } = createEventLoggerMock();
    const { capsuleStore, geneStore, upsertSpy } = createStores();
    const engine = new EvolutionEngine(baseConfig(), logger, capsuleStore, geneStore);

    engine.setGenePool([
      {
        type: 'Gene',
        id: 'gene_unrelated',
        category: 'performance',
        signals_match: ['perf_critical'],
        preconditions: [],
        strategy: ['optimize'],
        constraints: {}
      }
    ]);
    engine.setCapsulePool([]);

    const first = await engine.evolve(errorLogs);
    const autoGeneId = first.event.selected_gene;
    const second = await engine.evolve(errorLogs);

    expect(first.auto_gene_created).toBe(true);
    expect(second.auto_gene_created).toBe(false);
    expect(second.event.selected_gene).toBe(autoGeneId);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  test('审批拒绝不应记录失败事件或污染 bannedGeneIds', async () => {
    const { logger, events } = createEventLoggerMock();
    const engine = new EvolutionEngine(baseConfig({ review_mode: true }), logger);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    const primaryGene: Gene = {
      ...structuredClone(testGene),
      id: 'gene_primary',
      signals_match: ['log_error', 'error_type', 'error_undefined']
    };
    const fallbackGene: Gene = {
      ...structuredClone(testGene),
      id: 'gene_fallback',
      signals_match: ['log_error']
    };

    engine.setGenePool([primaryGene, fallbackGene]);
    engine.setCapsulePool([]);

    try {
      await expect(engine.evolve(errorLogs)).rejects.toThrow('Approval required');
      await expect(engine.evolve(errorLogs)).rejects.toThrow('Approval required');
      await expect(engine.evolve(errorLogs)).rejects.toThrow('Approval required');

      expect(events).toHaveLength(0);
    } finally {
      randomSpy.mockRestore();
    }
  });

  test('distilled 基因应应用评分折扣，优先选择非 distilled 基因', async () => {
    const { logger } = createEventLoggerMock();
    const engine = new EvolutionEngine(baseConfig(), logger);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    const distilledGene: Gene = {
      ...structuredClone(testGene),
      id: 'gene_distilled_repair',
      signals_match: ['log_error', 'error_type']
    };
    const normalGene: Gene = {
      ...structuredClone(testGene),
      id: 'gene_normal_repair',
      signals_match: ['log_error', 'error_type']
    };

    engine.setGenePool([distilledGene, normalGene]);
    engine.setCapsulePool([]);

    try {
      const result = await engine.evolve(errorLogs);
      expect(result.event.selected_gene).toBe('gene_normal_repair');
    } finally {
      randomSpy.mockRestore();
    }
  });
});
