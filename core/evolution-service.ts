import type { Capsule, Gene, KnowledgeProvenanceStatus } from '../types/gene-capsule-schema';
import type {
  KnowledgeUsageRef,
  RecordKnowledgeUsageInput,
  TaskOutcome,
  TaskRetrospective,
  TaskSession,
  ValidationResult
} from '../types/task-session-schema';
import { matchPatternToSignals } from './gene-selector';
import { findMatchingCapsules } from './capsule-manager';
import type { LocalEvomap } from '../index';
import { TaskSessionStore } from '../storage/task-session-store';

export interface EvolutionServiceDeps {
  evomap: LocalEvomap;
  taskStore: TaskSessionStore;
}

export interface StartTaskInput {
  goal: string;
  workspace: string;
  client: string;
  initialSignals?: string[];
}

export interface SearchKnowledgeInput {
  taskId?: string;
  signals?: string[];
  query?: string;
  workspace?: string;
  limit?: number;
}

export interface SearchKnowledgeResult {
  genes: Gene[];
  capsules: Capsule[];
  whyMatched: string[];
}

export interface StartTaskResult {
  taskId: string;
  recommendedGenes: Gene[];
  recommendedCapsules: Capsule[];
  workingHints: string[];
}

export interface RecordUsageRequest {
  taskId: string;
  knowledge: RecordKnowledgeUsageInput[];
}

export interface RecordUsageResult {
  accepted: number;
  taskState: TaskSession['status'];
}

export interface GetTaskContextRequest {
  taskId: string;
}

export interface RetrospectiveDraft {
  signals: string[];
  selfMistakes: string[];
  userCorrections: string[];
  validations: ValidationResult[];
}

export interface GetTaskContextResult {
  task: TaskSession;
  knowledgeUsed: KnowledgeUsageRef[];
  retrospectiveDraft: RetrospectiveDraft;
}

export interface FinalizeTaskRequest {
  taskId: string;
  summary: string;
  outcome: TaskOutcome;
  retrospective: Omit<TaskRetrospective, 'summary'>;
  createCapsule: boolean;
}

export interface FinalizeTaskResult {
  eventId: string;
  taskId: string;
  genesUpdated: string[];
  capsulesUpdated: string[];
  capsuleId: string | null;
  distillReady: boolean;
  knowledgeStatus: KnowledgeProvenanceStatus;
  warnings: string[];
}

export interface WorkspacePlaybook {
  workspace: string;
  recommendedGenes: string[];
  recentCapsules: string[];
  recentMistakes: string[];
  successfulTaskCount: number;
}

export interface WorkspaceRecentSuccesses {
  workspace: string;
  summaries: string[];
  capsules: string[];
}

export class EvolutionService {
  constructor(private deps: EvolutionServiceDeps) {}

  async startTask(input: StartTaskInput): Promise<StartTaskResult> {
    const task = await this.deps.taskStore.create({
      goal: input.goal,
      workspace: input.workspace,
      client: input.client,
      signals: input.initialSignals || []
    });

    const knowledge = await this.searchKnowledge({
      taskId: task.taskId,
      signals: task.signals,
      workspace: task.workspace,
      limit: 5
    });

    return {
      taskId: task.taskId,
      recommendedGenes: knowledge.genes,
      recommendedCapsules: knowledge.capsules,
      workingHints: this.buildWorkingHints(knowledge)
    };
  }

  async searchKnowledge(input: SearchKnowledgeInput): Promise<SearchKnowledgeResult> {
    const taskSignals = input.taskId
      ? (await this.deps.taskStore.get(input.taskId))?.signals || []
      : [];
    const querySignals = input.query ? input.query.split(/[^a-zA-Z0-9_-]+/).filter(Boolean) : [];
    const signals = this.normalizeSignals([...(input.signals || []), ...taskSignals, ...querySignals]);
    const limit = Math.max(1, input.limit || 5);

    if (signals.length === 0) {
      return {
        genes: [],
        capsules: [],
        whyMatched: ['No signals available for knowledge search']
      };
    }

    const allGenes = await this.deps.evomap.getAllGenes();
    const matchedGenes = allGenes
      .filter(gene => gene.signals_match.some(pattern => matchPatternToSignals(pattern, signals)))
      .sort((left, right) => this.countGeneMatches(right, signals) - this.countGeneMatches(left, signals))
      .slice(0, limit);

    const allCapsules = await this.deps.evomap.getAllCapsules();
    const matchedCapsules = findMatchingCapsules(allCapsules, signals)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, limit);

    return {
      genes: matchedGenes,
      capsules: matchedCapsules,
      whyMatched: [`Matched ${matchedGenes.length} gene(s) and ${matchedCapsules.length} capsule(s) for signals: ${signals.join(', ')}`]
    };
  }

  async recordUsage(input: RecordUsageRequest): Promise<RecordUsageResult> {
    const before = await this.requireTask(input.taskId);
    let current = before;

    for (const knowledgeRef of input.knowledge) {
      current = await this.deps.taskStore.recordUsage(input.taskId, knowledgeRef);
    }

    return {
      accepted: current.knowledgeRefs.length - before.knowledgeRefs.length,
      taskState: current.status
    };
  }

  async getTaskContext(input: GetTaskContextRequest): Promise<GetTaskContextResult> {
    const task = await this.requireTask(input.taskId);
    return {
      task,
      knowledgeUsed: task.knowledgeRefs,
      retrospectiveDraft: {
        signals: task.retrospective?.signals || task.signals,
        selfMistakes: task.retrospective?.selfMistakes || [],
        userCorrections: task.retrospective?.userCorrections || [],
        validations: task.retrospective?.validations || []
      }
    };
  }

  async finalizeTask(input: FinalizeTaskRequest): Promise<FinalizeTaskResult> {
    const task = await this.requireTask(input.taskId);
    if (task.status === 'finalized' && task.finalization) {
      return {
        eventId: task.finalization.eventId,
        taskId: task.taskId,
        genesUpdated: task.finalization.genesUpdated,
        capsulesUpdated: task.finalization.capsulesUpdated,
        capsuleId: task.finalization.capsuleId,
        distillReady: task.finalization.distillReady,
        knowledgeStatus: task.finalization.knowledgeStatus,
        warnings: task.finalization.warnings
      };
    }

    const usedGene = task.knowledgeRefs.find(ref => ref.kind === 'gene');
    const usedCapsule = task.knowledgeRefs.find(ref => ref.kind === 'capsule');
    const knowledgeStatus: KnowledgeProvenanceStatus = usedGene
      ? 'recorded'
      : usedCapsule
        ? 'capsule_only'
        : 'no_knowledge_used';
    const warnings = knowledgeStatus === 'no_knowledge_used'
      ? ['Task finalized without recorded gene/capsule usage']
      : [];
    const validations = input.retrospective.validations || [];
    const validationErrors = validations.filter(item => !item.passed).map(item => item.command);

    const feedbackResult = await this.deps.evomap.submitFeedback({
      signals: this.normalizeSignals([...task.signals, ...input.retrospective.signals]),
      selected_gene: usedGene?.id,
      used_capsule: usedCapsule?.id,
      summary: input.summary,
      self_mistakes: input.retrospective.selfMistakes,
      user_corrections: input.retrospective.userCorrections,
      outcome: input.outcome,
      validation: {
        passed: validations.length === 0 ? input.outcome.status === 'success' : validationErrors.length === 0,
        commands_run: validations.length,
        errors: validationErrors.length > 0 ? validationErrors : undefined
      },
      create_capsule: input.createCapsule,
      knowledge_status: knowledgeStatus
    });

    const genesUpdated = feedbackResult.gene_updated && usedGene ? [usedGene.id] : [];
    const capsulesUpdated = feedbackResult.capsule_updated && usedCapsule ? [usedCapsule.id] : [];

    await this.deps.taskStore.finalize(input.taskId, {
      summary: input.summary,
      signals: this.normalizeSignals([...task.signals, ...input.retrospective.signals]),
      selfMistakes: input.retrospective.selfMistakes,
      userCorrections: input.retrospective.userCorrections,
      validations,
      outcome: input.outcome,
      finalization: {
        eventId: feedbackResult.event_id,
        capsuleId: feedbackResult.capsule_id,
        distillReady: feedbackResult.distill_ready,
        genesUpdated,
        capsulesUpdated,
        knowledgeStatus,
        warnings
      }
    });

    return {
      eventId: feedbackResult.event_id,
      taskId: input.taskId,
      genesUpdated,
      capsulesUpdated,
      capsuleId: feedbackResult.capsule_id,
      distillReady: feedbackResult.distill_ready,
      knowledgeStatus,
      warnings
    };
  }

  async getWorkspacePlaybook(workspace: string): Promise<WorkspacePlaybook> {
    const tasks = (await this.deps.taskStore.getAll())
      .filter(task => task.workspace === workspace)
      .filter(task => task.status === 'finalized' && task.outcome && task.outcome.status !== 'failed');

    const geneCounts = new Map<string, number>();
    const capsuleCounts = new Map<string, number>();
    const mistakeCounts = new Map<string, number>();

    for (const task of tasks) {
      const genes = task.finalization?.genesUpdated || task.knowledgeRefs.filter(ref => ref.kind === 'gene').map(ref => ref.id);
      const capsules = task.finalization?.capsulesUpdated || task.knowledgeRefs.filter(ref => ref.kind === 'capsule').map(ref => ref.id);

      for (const geneId of genes) {
        geneCounts.set(geneId, (geneCounts.get(geneId) || 0) + 1);
      }

      for (const capsuleId of capsules) {
        capsuleCounts.set(capsuleId, (capsuleCounts.get(capsuleId) || 0) + 1);
      }

      for (const mistake of task.retrospective?.selfMistakes || []) {
        mistakeCounts.set(mistake, (mistakeCounts.get(mistake) || 0) + 1);
      }
    }

    return {
      workspace,
      recommendedGenes: this.sortCounts(geneCounts).slice(0, 5).map(([id]) => id),
      recentCapsules: this.sortCounts(capsuleCounts).slice(0, 5).map(([id]) => id),
      recentMistakes: this.sortCounts(mistakeCounts).slice(0, 5).map(([id]) => id),
      successfulTaskCount: tasks.length
    };
  }

  async getWorkspaceRecentSuccesses(workspace: string): Promise<WorkspaceRecentSuccesses> {
    const tasks = (await this.deps.taskStore.getAll())
      .filter(task => task.workspace === workspace)
      .filter(task => task.status === 'finalized' && task.outcome?.status === 'success')
      .sort((left, right) => (right.finalizedAt || '').localeCompare(left.finalizedAt || ''))
      .slice(0, 5);

    return {
      workspace,
      summaries: tasks.map(task => task.retrospective?.summary || task.goal),
      capsules: tasks.flatMap(task => task.finalization?.capsulesUpdated || [])
    };
  }

  private async requireTask(taskId: string): Promise<TaskSession> {
    const task = await this.deps.taskStore.get(taskId);
    if (!task) {
      throw new Error(`Task session not found: ${taskId}`);
    }
    return task;
  }

  private normalizeSignals(signals: string[]): string[] {
    return Array.from(new Set(signals.map(signal => signal.trim()).filter(Boolean)));
  }

  private countGeneMatches(gene: Gene, signals: string[]): number {
    return gene.signals_match.reduce((count, pattern) => (
      count + (matchPatternToSignals(pattern, signals) ? 1 : 0)
    ), 0);
  }

  private buildWorkingHints(knowledge: SearchKnowledgeResult): string[] {
    const hints: string[] = [];

    if (knowledge.genes.length > 0) {
      hints.push(`Top gene: ${knowledge.genes[0].id}`);
    }

    if (knowledge.capsules.length > 0) {
      hints.push(`Relevant capsule: ${knowledge.capsules[0].id}`);
    }

    return hints.length > 0 ? hints : ['No direct matches found; proceed carefully and record new learning.'];
  }

  private sortCounts(counts: Map<string, number>): Array<[string, number]> {
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  }
}
