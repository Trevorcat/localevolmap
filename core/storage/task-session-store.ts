import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  CreateTaskSessionInput,
  FinalizeTaskSessionInput,
  RecordKnowledgeUsageInput,
  TaskSession
} from '../types/task-session-schema';

export class TaskSessionStore {
  constructor(private basePath: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async create(input: CreateTaskSessionInput): Promise<TaskSession> {
    await this.init();

    const task: TaskSession = {
      taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      goal: input.goal.trim(),
      workspace: input.workspace.trim(),
      client: input.client.trim(),
      status: 'active',
      openedAt: new Date().toISOString(),
      signals: this.normalizeStrings(input.signals || []),
      knowledgeRefs: []
    };

    await this.writeTask(task);
    return task;
  }

  async get(taskId: string): Promise<TaskSession | undefined> {
    try {
      const content = await fs.readFile(this.getTaskPath(taskId), 'utf-8');
      return JSON.parse(content) as TaskSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error instanceof Error && error.message.includes('ENOENT'))) {
        return undefined;
      }
      throw error;
    }
  }

  async getAll(): Promise<TaskSession[]> {
    try {
      const files = await fs.readdir(this.basePath);
      const tasks = await Promise.all(files
        .filter(file => file.endsWith('.json'))
        .map(file => this.get(path.basename(file, '.json'))));

      return tasks.filter((task): task is TaskSession => Boolean(task));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error instanceof Error && error.message.includes('ENOENT'))) {
        return [];
      }
      throw error;
    }
  }

  async update(task: TaskSession): Promise<void> {
    await this.writeTask(task);
  }

  async recordUsage(taskId: string, input: RecordKnowledgeUsageInput): Promise<TaskSession> {
    const task = await this.requireTask(taskId);
    if (task.status === 'finalized') {
      throw new Error(`Task session ${taskId} is already finalized`);
    }

    const existing = task.knowledgeRefs.find(ref => (
      ref.kind === input.kind &&
      ref.id === input.id &&
      ref.phase === input.phase
    ));

    if (existing) {
      return task;
    }

    task.knowledgeRefs.push({
      kind: input.kind,
      id: input.id,
      phase: input.phase,
      usedAt: new Date().toISOString(),
      note: input.note?.trim() || undefined
    });

    await this.writeTask(task);
    return task;
  }

  async finalize(taskId: string, input: FinalizeTaskSessionInput): Promise<TaskSession> {
    const task = await this.requireTask(taskId);
    if (task.status === 'finalized') {
      return task;
    }

    task.status = 'finalized';
    task.finalizedAt = new Date().toISOString();
    task.retrospective = {
      summary: input.summary.trim(),
      signals: this.normalizeStrings(input.signals),
      selfMistakes: this.normalizeStrings(input.selfMistakes),
      userCorrections: this.normalizeStrings(input.userCorrections),
      validations: (input.validations || []).map(validation => ({
        command: validation.command.trim(),
        passed: validation.passed,
        notes: validation.notes?.trim() || undefined
      }))
    };
    task.outcome = {
      status: input.outcome.status,
      score: input.outcome.score
    };
    task.finalization = input.finalization;

    await this.writeTask(task);
    return task;
  }

  private async requireTask(taskId: string): Promise<TaskSession> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task session not found: ${taskId}`);
    }
    return task;
  }

  private async writeTask(task: TaskSession): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.writeFile(this.getTaskPath(task.taskId), JSON.stringify(task, null, 2), 'utf-8');
  }

  private getTaskPath(taskId: string): string {
    return path.join(this.basePath, `${this.sanitizeId(taskId)}.json`);
  }

  private normalizeStrings(values: string[]): string[] {
    return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
}
