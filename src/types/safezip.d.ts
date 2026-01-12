/**
 * SafeZip Types
 * Types for Safe ZIP / Packaging feature
 */

export type JobStatus = 'CREATED' | 'COPYING' | 'ZIPPING' | 'READY' | 'EXPORTED' | 'ERROR';

export interface SafeZipJob {
  id: string;
  createdAt: string;
  sourcePath: string;
  sourceName: string;
  stagingPath: string;
  dataPath: string;
  outPath: string;
  status: JobStatus;
  zipName: string | null;
  zipPath: string | null;
  error: string | null;
  stats: {
    totalFiles: number;
    totalSize: number;
    copiedFiles: number;
    zippedFiles: number;
    skippedFiles: number;
    maxPathLength: number;
  };
}

export interface CopyProgress {
  current: number;
  total: number;
  currentFile: string;
  phase: 'scanning' | 'copying';
}

export interface ZipProgress {
  current: number;
  total: number;
  currentFile: string;
}

export interface ProblematicFile {
  path: string;
  fullPath: string;
  length: number;
  hasShortName?: boolean;
}

export interface PathAnalysis {
  maxInternalPathLength: number;
  maxPathLength: number;
  riskLevel: 'ok' | 'warning' | 'danger';
  totalFiles: number;
  totalSize: number;
  longestPath: string;
  hasShortNames?: boolean;
  shortNameWarning?: string | null;
  isSafeForDirectTransfer: boolean;
  needsPreparation: boolean;
  problematicFiles: ProblematicFile[];
}

export interface CopyResult {
  success: boolean;
  totalFiles: number;
  copiedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; reason: string }>;
}

export interface ZipResult {
  success: boolean;
  zipPath: string;
  zipSize: number;
  filesZipped: number;
}

export interface SaveZipResult {
  success: boolean;
  finalPath: string;
  error?: string;
}
