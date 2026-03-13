import * as fs from 'fs/promises';
import * as path from 'path';

export type DistillJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface DistillJob {
  jobId: string;
  fingerprint: string;
  status: DistillJobStatus;
  sourceCapsuleIds: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultGeneId?: string | null;
  error?: string;
}

export interface CreateDistillJobInput {
  sourceCapsuleIds: string[];
  fingerprint: string;
}

export class DistillJobStore {
  constructor(private basePath: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async createPending(input: CreateDistillJobInput): Promise<DistillJob> {
    await this.init();

    const existing = (await this.getAll()).find(job => job.fingerprint === input.fingerprint && (job.status === 'pending' || job.status === 'running'));
    if (existing) {
      return existing;
    }

    const job: DistillJob = {
      jobId: `distill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fingerprint: input.fingerprint,
      status: 'pending',
      sourceCapsuleIds: this.normalizeStrings(input.sourceCapsuleIds),
      createdAt: new Date().toISOString()
    };

    await this.writeJob(job);
    return job;
  }

  async get(jobId: string): Promise<DistillJob | undefined> {
    try {
      const content = await fs.readFile(this.getJobPath(jobId), 'utf-8');
      return JSON.parse(content) as DistillJob;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error instanceof Error && error.message.includes('ENOENT'))) {
        return undefined;
      }
      throw error;
    }
  }

  async getAll(): Promise<DistillJob[]> {
    try {
      const files = await fs.readdir(this.basePath);
      const jobs = await Promise.all(files
        .filter(file => file.endsWith('.json'))
        .map(file => this.get(path.basename(file, '.json'))));

      return jobs.filter((job): job is DistillJob => Boolean(job));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error instanceof Error && error.message.includes('ENOENT'))) {
        return [];
      }
      throw error;
    }
  }

  async markRunning(jobId: string): Promise<DistillJob> {
    const job = await this.requireJob(jobId);
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    await this.writeJob(job);
    return job;
  }

  async markSucceeded(jobId: string, resultGeneId?: string | null): Promise<DistillJob> {
    const job = await this.requireJob(jobId);
    job.status = 'succeeded';
    job.resultGeneId = resultGeneId ?? null;
    job.finishedAt = new Date().toISOString();
    await this.writeJob(job);
    return job;
  }

  async markFailed(jobId: string, errorMessage: string): Promise<DistillJob> {
    const job = await this.requireJob(jobId);
    job.status = 'failed';
    job.error = errorMessage;
    job.finishedAt = new Date().toISOString();
    await this.writeJob(job);
    return job;
  }

  private async requireJob(jobId: string): Promise<DistillJob> {
    const job = await this.get(jobId);
    if (!job) {
      throw new Error(`Distill job not found: ${jobId}`);
    }
    return job;
  }

  private async writeJob(job: DistillJob): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.writeFile(this.getJobPath(job.jobId), JSON.stringify(job, null, 2), 'utf-8');
  }

  private getJobPath(jobId: string): string {
    return path.join(this.basePath, `${this.sanitizeId(jobId)}.json`);
  }

  private normalizeStrings(values: string[]): string[] {
    return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
}
