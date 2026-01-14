/**
 * SafeZip Handler
 * Main process logic for Safe ZIP / Packaging feature
 */

const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const archiver = require('archiver');
const { createReadStream, createWriteStream, existsSync, statSync } = require('fs');

// Constants
const MAX_JOBS_TO_KEEP = 3;
const JOB_NAME_MAX_LENGTH = 32;
const MAX_SAFE_PATH_LENGTH = 240; // Safe limit for Windows paths (~250) - leaves margin for Downloads folder
const MAX_INTERNAL_PATH_WARNING = 200;
const MAX_INTERNAL_PATH_DANGER = 240;
const FORBIDDEN_CHARS = /[<>:"/\\|?*]/g;
const RETRY_DELAYS = [200, 500, 1000];
const README_NAME = 'LISEZ-MOI.txt';
const README_CONTENT =
  'RENDEXPRESS - CONSEIL\n\n' +
  'Pour éviter les problèmes de compatibilité, il est préférable de dézipper ce dossier sur le Bureau avant utilisation.\n';

// Regex pour détecter les noms de fichiers/dossiers au format 8.3 de Windows
// Format typique : 6 caractères + ~1 + extension de 3 caractères
// Ex: PROGRA~1, DOCUME~1, LOCALS~1
const SHORT_NAME_PATTERN = /~\d+/;

/**
 * Get staging directory path
 */
function getStagingRoot() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'staging');
}

/**
 * Check if a path contains Windows short names (8.3 format)
 * Returns true if the path contains shortened names like PROGRA~1
 */
function hasShortNames(pathString) {
  // Split path into segments
  const segments = pathString.split(path.sep);

  // Check each segment for short name pattern
  for (const segment of segments) {
    if (SHORT_NAME_PATTERN.test(segment)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect if source path uses Windows short names and return warning
 */
function checkPathForShortNames(sourcePath) {
  if (hasShortNames(sourcePath)) {
    return {
      hasShortNames: true,
      warning: 'Le chemin source contient des noms courts Windows (format 8.3 comme PROGRA~1). Cela indique que le chemin original est probablement trop long. Risque élevé de problèmes lors de l\'extraction.'
    };
  }

  return {
    hasShortNames: false,
    warning: null
  };
}

/**
 * Normalize folder name for job naming
 * - Replace spaces with underscores
 * - Remove forbidden Windows characters
 * - Trim and limit length
 */
function normalizeJobName(folderName) {
  let normalized = folderName
    .replace(/\s+/g, '_')
    .replace(FORBIDDEN_CHARS, '')
    .trim();

  if (!normalized) {
    normalized = 'RENDU';
  }

  if (normalized.length > JOB_NAME_MAX_LENGTH) {
    normalized = normalized.substring(0, JOB_NAME_MAX_LENGTH);
  }

  return normalized;
}

/**
 * Generate unique job name with collision handling
 */
async function generateJobName(sourcePath) {
  const now = new Date();
  const datePrefix = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const folderName = path.basename(sourcePath);
  const normalized = normalizeJobName(folderName);

  const stagingRoot = getStagingRoot();
  await fs.mkdir(stagingRoot, { recursive: true });

  let jobName = `${datePrefix}_${normalized}`;
  let counter = 1;

  while (existsSync(path.join(stagingRoot, jobName))) {
    jobName = `${datePrefix}_${normalized}-${counter}`;
    counter++;
  }

  return jobName;
}

/**
 * Create job directory structure and job.json
 */
async function createJobDirectory(sourcePath) {
  const jobName = await generateJobName(sourcePath);
  const stagingRoot = getStagingRoot();
  const jobPath = path.join(stagingRoot, jobName);
  const dataPath = path.join(jobPath, 'DATA');
  const outPath = path.join(jobPath, 'OUT');

  await fs.mkdir(jobPath, { recursive: true });
  await fs.mkdir(dataPath, { recursive: true });
  await fs.mkdir(outPath, { recursive: true });

  const job = {
    id: jobName,
    createdAt: new Date().toISOString(),
    sourcePath,
    sourceName: path.basename(sourcePath),
    stagingPath: jobPath,
    dataPath,
    outPath,
    status: 'CREATED',
    zipName: null,
    zipPath: null,
    error: null,
    stats: {
      totalFiles: 0,
      totalSize: 0,
      copiedFiles: 0,
      zippedFiles: 0,
      skippedFiles: 0,
      maxPathLength: 0
    }
  };

  await fs.writeFile(
    path.join(jobPath, 'job.json'),
    JSON.stringify(job, null, 2),
    'utf8'
  );

  return job;
}

/**
 * Update job.json
 */
async function updateJob(jobPath, updates) {
  const jobJsonPath = path.join(jobPath, 'job.json');
  const jobData = JSON.parse(await fs.readFile(jobJsonPath, 'utf8'));
  const updatedJob = { ...jobData, ...updates };
  await fs.writeFile(jobJsonPath, JSON.stringify(updatedJob, null, 2), 'utf8');
  return updatedJob;
}

/**
 * Read job.json
 */
async function readJob(jobPath) {
  const jobJsonPath = path.join(jobPath, 'job.json');
  if (!existsSync(jobJsonPath)) {
    return null;
  }
  return JSON.parse(await fs.readFile(jobJsonPath, 'utf8'));
}

/**
 * Scan source directory to count files and analyze paths
 */
async function scanDirectory(dirPath, baseDir = dirPath) {
  let files = [];
  let totalSize = 0;
  let maxPathLength = 0;
  let hasShortNamesInFiles = false;
  let problematicFiles = []; // Files exceeding safe path length

  async function scan(currentPath) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        // Check for short names in the full path
        const hasShortName = hasShortNames(fullPath);
        if (hasShortName) {
          hasShortNamesInFiles = true;
        }

        // Skip system files
        if (entry.name === 'Thumbs.db' || entry.name === '.DS_Store') {
          continue;
        }

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(fullPath);
            const pathLength = fullPath.length;

            files.push({ fullPath, relativePath, size: stats.size, pathLength });
            totalSize += stats.size;
            maxPathLength = Math.max(maxPathLength, pathLength);

            // Track files exceeding safe limit OR with short names
            if (pathLength > MAX_SAFE_PATH_LENGTH || hasShortName) {
              problematicFiles.push({
                path: relativePath,
                fullPath: fullPath,
                length: pathLength,
                hasShortName: hasShortName
              });
            }
          } catch (err) {
            console.warn(`Cannot stat file: ${fullPath}`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn(`Cannot scan directory: ${currentPath}`, err.message);
    }
  }

  await scan(dirPath);

  return { files, totalSize, maxPathLength, hasShortNamesInFiles, problematicFiles };
}

/**
 * Copy file with retry on locked files
 */
async function copyFileWithRetry(srcPath, destPath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      return { success: true };
    } catch (err) {
      if (i === retries - 1) {
        return { success: false, error: err.message };
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i] || 1000));
    }
  }
}

/**
 * Copy source directory to staging DATA folder
 */
async function copySourceToStaging(job, onProgress) {
  const { sourcePath, dataPath, stagingPath } = job;

  // Update job status
  await updateJob(stagingPath, { status: 'COPYING' });

  // Scan source
  if (onProgress) onProgress({ phase: 'scanning', current: 0, total: 0, currentFile: '' });
  const { files, totalSize, maxPathLength, hasShortNamesInFiles, problematicFiles } = await scanDirectory(sourcePath);

  const errors = [];
  let copiedCount = 0;

  // Copy files
  for (const file of files) {
    const destPath = path.join(dataPath, file.relativePath);

    if (onProgress) {
      onProgress({
        phase: 'copying',
        current: copiedCount,
        total: files.length,
        currentFile: file.relativePath
      });
    }

    const result = await copyFileWithRetry(file.fullPath, destPath);
    if (result.success) {
      copiedCount++;
    } else {
      errors.push({ file: file.relativePath, reason: result.error });
    }
  }

  // Update job
  const updatedJob = await updateJob(stagingPath, {
    status: errors.length === files.length ? 'ERROR' : 'COPYING',
    stats: {
      totalFiles: files.length,
      totalSize,
      copiedFiles: copiedCount,
      skippedFiles: errors.length,
      zippedFiles: 0,
      maxPathLength
    }
  });

  return {
    success: copiedCount > 0,
    totalFiles: files.length,
    copiedFiles: copiedCount,
    skippedFiles: errors.length,
    errors
  };
}

/**
 * Analyze path lengths for extraction risk
 */
function analyzePathLengths(files, rootName) {
  let maxInternalLength = 0;
  let longestPath = '';

  for (const file of files) {
    const internalPath = path.join(rootName, file.relativePath);
    const length = internalPath.length;
    if (length > maxInternalLength) {
      maxInternalLength = length;
      longestPath = internalPath;
    }
  }

  let riskLevel = 'ok';
  if (maxInternalLength > MAX_INTERNAL_PATH_DANGER) {
    riskLevel = 'danger';
  } else if (maxInternalLength > MAX_INTERNAL_PATH_WARNING) {
    riskLevel = 'warning';
  }

  return {
    maxInternalPathLength: maxInternalLength,
    riskLevel,
    longestPath
  };
}

/**
 * Create ZIP from DATA folder using Smart Root strategy
 */
async function createZipFromData(job, onProgress) {
  const { dataPath, outPath, stagingPath, sourceName } = job;

  // Update job status
  await updateJob(stagingPath, { status: 'ZIPPING' });

  // Scan DATA folder
  const { files, totalSize } = await scanDirectory(dataPath);

  if (files.length === 0) {
    throw new Error('No files to zip');
  }

  // Smart Root: use normalized source name as root in ZIP
  const rootName = normalizeJobName(sourceName);

  // Analyze paths
  const analysis = analyzePathLengths(files, rootName);

  // Create ZIP - use original source name for ZIP file
  const zipName = `${sourceName}.zip`;
  const zipPath = path.join(outPath, zipName);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    let processedFiles = 0;

    output.on('close', async () => {
      const zipSize = statSync(zipPath).size;

      // Update job
      const updatedJob = await updateJob(stagingPath, {
        status: 'READY',
        zipName,
        zipPath,
        stats: {
          ...job.stats,
          zippedFiles: files.length
        }
      });

      resolve({
        success: true,
        zipPath,
        zipSize,
        filesZipped: files.length,
        analysis
      });
    });

    output.on('error', reject);
    archive.on('error', reject);

    archive.on('entry', () => {
      processedFiles++;
      if (onProgress) {
        onProgress({
          current: processedFiles,
          total: files.length,
          currentFile: files[processedFiles - 1]?.relativePath || ''
        });
      }
    });

    archive.pipe(output);

    archive.append(README_CONTENT, { name: README_NAME });

    // Add files to archive with Smart Root
    for (const file of files) {
      const internalPath = path.join(rootName, file.relativePath);
      archive.file(file.fullPath, { name: internalPath });
    }

    archive.finalize();
  });
}

/**
 * Save ZIP to user-selected destination
 */
async function saveZipToDestination(job, destinationPath) {
  const { zipPath, stagingPath } = job;

  if (!zipPath || !existsSync(zipPath)) {
    throw new Error('ZIP file not found');
  }

  // Check if same drive (for move vs copy)
  const srcDrive = path.parse(zipPath).root;
  const destDrive = path.parse(destinationPath).root;

  if (srcDrive === destDrive) {
    // Same drive: rename (atomic move)
    await fs.rename(zipPath, destinationPath);
  } else {
    // Different drive: copy + verify + delete
    await fs.copyFile(zipPath, destinationPath);

    // Verify sizes match
    const srcSize = statSync(zipPath).size;
    const destSize = statSync(destinationPath).size;

    if (srcSize !== destSize) {
      await fs.unlink(destinationPath);
      throw new Error('ZIP copy verification failed: size mismatch');
    }

    await fs.unlink(zipPath);
  }

  // Update job
  await updateJob(stagingPath, {
    status: 'EXPORTED',
    zipPath: destinationPath
  });

  return { success: true, finalPath: destinationPath };
}

/**
 * List all jobs
 */
async function listJobs() {
  const stagingRoot = getStagingRoot();

  if (!existsSync(stagingRoot)) {
    return [];
  }

  const entries = await fs.readdir(stagingRoot, { withFileTypes: true });
  const jobs = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const jobPath = path.join(stagingRoot, entry.name);
      const job = await readJob(jobPath);
      if (job) {
        jobs.push(job);
      }
    }
  }

  // Sort by createdAt descending
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return jobs;
}

/**
 * Delete directory recursively with retry
 */
async function deleteDirectoryWithRetry(dirPath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      if (i === retries - 1) {
        return { success: false, error: err.message };
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i] || 1000));
    }
  }
}

/**
 * Cleanup old jobs (keep only MAX_JOBS_TO_KEEP most recent)
 */
async function cleanupOldJobs() {
  const jobs = await listJobs();

  if (jobs.length <= MAX_JOBS_TO_KEEP) {
    return { cleaned: 0, errors: [] };
  }

  const jobsToDelete = jobs.slice(MAX_JOBS_TO_KEEP);
  const errors = [];
  let cleaned = 0;

  for (const job of jobsToDelete) {
    // Never delete running jobs
    if (job.status === 'COPYING' || job.status === 'ZIPPING') {
      continue;
    }

    const result = await deleteDirectoryWithRetry(job.stagingPath);
    if (result.success) {
      cleaned++;
    } else {
      errors.push({ job: job.id, error: result.error });
    }
  }

  return { cleaned, errors };
}

/**
 * Get path analysis for a source directory
 */
async function analyzeSourcePath(sourcePath) {
  // Check for Windows short names in the source path
  const shortNameCheck = checkPathForShortNames(sourcePath);

  const { files, totalSize, hasShortNamesInFiles, problematicFiles, maxPathLength } = await scanDirectory(sourcePath);
  const rootName = normalizeJobName(path.basename(sourcePath));
  const analysis = analyzePathLengths(files, rootName);

  // Combine both short name checks: source path OR any file inside
  const finalHasShortNames = shortNameCheck.hasShortNames || hasShortNamesInFiles;

  // Determine if folder is safe for direct transfer
  const isSafeForDirectTransfer = !finalHasShortNames && problematicFiles.length === 0;
  const needsPreparation = !isSafeForDirectTransfer;

  // Upgrade risk level if short names detected anywhere
  let finalRiskLevel = analysis.riskLevel;
  if (finalHasShortNames && finalRiskLevel !== 'danger') {
    finalRiskLevel = 'danger';
  }

  // Update warning message to cover both cases
  let finalWarning = null;
  if (finalHasShortNames) {
    if (shortNameCheck.hasShortNames && hasShortNamesInFiles) {
      finalWarning = 'Le chemin source ET des fichiers internes contiennent des noms courts Windows (format 8.3 comme PROGRA~1). Cela indique que les chemins sont probablement trop longs. Risque élevé de problèmes lors de l\'extraction.';
    } else if (shortNameCheck.hasShortNames) {
      finalWarning = shortNameCheck.warning;
    } else {
      finalWarning = 'Des fichiers internes contiennent des noms courts Windows (format 8.3 comme PROGRA~1). Cela indique que les chemins sont probablement trop longs. Risque élevé de problèmes lors de l\'extraction.';
    }
  }

  return {
    ...analysis,
    riskLevel: finalRiskLevel,
    totalFiles: files.length,
    totalSize,
    maxPathLength,
    hasShortNames: finalHasShortNames,
    shortNameWarning: finalWarning,
    isSafeForDirectTransfer,
    needsPreparation,
    problematicFiles: problematicFiles // Return all problematic files
  };
}

/**
 * Create ZIP directly from source folder (for safe direct uploads)
 * No staging, no job directory - just a simple ZIP
 */
async function createDirectZipFromSource(sourcePath, onProgress) {
  const sourceName = path.basename(sourcePath);
  const tempDir = path.join(app.getPath('temp'), 'rendexpress-direct-zip');

  // Ensure temp directory exists
  await fs.mkdir(tempDir, { recursive: true });

  // Scan source folder
  const { files, totalSize } = await scanDirectory(sourcePath);

  if (files.length === 0) {
    throw new Error('No files to zip');
  }

  // Create ZIP with source folder name
  const zipName = `${sourceName}.zip`;
  const zipPath = path.join(tempDir, zipName);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    let processedFiles = 0;

    output.on('close', () => {
      const zipSize = statSync(zipPath).size;
      resolve({
        success: true,
        zipPath,
        zipSize,
        filesZipped: files.length
      });
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.on('progress', (progress) => {
      if (onProgress) {
        const percentage = totalSize > 0 ? Math.round((progress.fs.processedBytes / totalSize) * 100) : 0;
        onProgress({
          current: processedFiles,
          total: files.length,
          percentage,
          currentFile: ''
        });
      }
    });

    archive.pipe(output);

    archive.append(README_CONTENT, { name: README_NAME });

    // Add all files to archive with source folder name as root
    for (const file of files) {
      const entryName = path.join(sourceName, file.relativePath);
      archive.file(file.fullPath, { name: entryName });
      processedFiles++;
    }

    archive.finalize();
  });
}

/**
 * Create job directory for multiple sources
 * Creates a fusion folder containing all source items
 * @param {string[]} sourcePaths - Array of source paths
 * @param {string} [customName] - Optional custom name for the ZIP
 */
async function createJobDirectoryMultiple(sourcePaths, customName = null) {
  // Generate job name from custom name, first source, or use generic name
  let baseName;
  if (customName && customName.trim()) {
    baseName = customName.trim();
  } else if (sourcePaths.length === 1) {
    // Single source: use its name without "Fusion" suffix
    baseName = path.basename(sourcePaths[0]);
  } else {
    // Multiple sources without custom name: use first source + "Fusion"
    baseName = sourcePaths.length > 0 ? `${path.basename(sourcePaths[0])}_Fusion` : 'Fusion';
  }

  const now = new Date();
  const datePrefix = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const normalized = normalizeJobName(baseName);

  const stagingRoot = getStagingRoot();
  await fs.mkdir(stagingRoot, { recursive: true });

  let jobName = `${datePrefix}_${normalized}`;
  let counter = 1;

  while (existsSync(path.join(stagingRoot, jobName))) {
    jobName = `${datePrefix}_${normalized}-${counter}`;
    counter++;
  }

  const jobPath = path.join(stagingRoot, jobName);
  const dataPath = path.join(jobPath, 'DATA');
  const outPath = path.join(jobPath, 'OUT');

  await fs.mkdir(jobPath, { recursive: true });
  await fs.mkdir(dataPath, { recursive: true });
  await fs.mkdir(outPath, { recursive: true });

  const job = {
    id: jobName,
    createdAt: new Date().toISOString(),
    sourcePath: dataPath, // Use dataPath as source since we're copying multiple sources there
    sourceName: jobName,
    stagingPath: jobPath,
    dataPath,
    outPath,
    status: 'CREATED',
    zipName: null,
    zipPath: null,
    error: null,
    stats: {
      totalFiles: 0,
      totalSize: 0,
      copiedFiles: 0,
      zippedFiles: 0,
      skippedFiles: 0,
      maxPathLength: 0
    },
    multipleSources: sourcePaths // Store original sources
  };

  await fs.writeFile(
    path.join(jobPath, 'job.json'),
    JSON.stringify(job, null, 2),
    'utf8'
  );

  return job;
}

/**
 * Copy multiple sources to staging DATA folder
 */
async function copyMultipleSourcesToStaging(job, onProgress) {
  const { multipleSources, dataPath, stagingPath } = job;

  // Update job status
  await updateJob(stagingPath, { status: 'COPYING' });

  // Scan all sources first to get total count
  if (onProgress) onProgress({ phase: 'scanning', current: 0, total: 0, currentFile: '' });

  let allFiles = [];
  let totalSize = 0;
  let maxPathLength = 0;

  for (const sourcePath of multipleSources) {
    const sourceName = path.basename(sourcePath);

    // Check if source is a file or directory
    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      // It's a directory - scan it
      const { files, totalSize: sourceSize, maxPathLength: sourceMaxPath } = await scanDirectory(sourcePath);

      // Prefix each file with its source folder name to avoid conflicts
      const prefixedFiles = files.map(file => ({
        ...file,
        relativePath: path.join(sourceName, file.relativePath),
        originalSource: sourcePath
      }));

      allFiles.push(...prefixedFiles);
      totalSize += sourceSize;
      maxPathLength = Math.max(maxPathLength, sourceMaxPath);
    } else if (stats.isFile()) {
      // It's a file - add it directly
      const pathLength = sourcePath.length;
      allFiles.push({
        fullPath: sourcePath,
        relativePath: sourceName, // Just the filename
        size: stats.size,
        pathLength,
        originalSource: sourcePath
      });
      totalSize += stats.size;
      maxPathLength = Math.max(maxPathLength, pathLength);
    }
  }

  const errors = [];
  let copiedCount = 0;

  // Copy files
  for (const file of allFiles) {
    const destPath = path.join(dataPath, file.relativePath);

    if (onProgress) {
      onProgress({
        phase: 'copying',
        current: copiedCount,
        total: allFiles.length,
        currentFile: file.relativePath
      });
    }

    const result = await copyFileWithRetry(file.fullPath, destPath);
    if (result.success) {
      copiedCount++;
    } else {
      errors.push({
        file: file.relativePath,
        reason: result.error
      });
    }
  }

  // Update job with stats
  await updateJob(stagingPath, {
    status: 'COPYING_DONE',
    stats: {
      ...job.stats,
      totalFiles: allFiles.length,
      totalSize,
      copiedFiles: copiedCount,
      skippedFiles: errors.length,
      maxPathLength
    }
  });

  return {
    success: true,
    totalFiles: allFiles.length,
    copiedFiles: copiedCount,
    skippedFiles: errors.length,
    errors
  };
}

/**
 * Analyze multiple sources
 */
async function analyzeMultipleSources(sourcePaths) {
  let totalFiles = 0;
  let totalSize = 0;
  let maxPathLength = 0;
  let hasShortNames = false;
  let allProblematicFiles = [];
  let longestPath = '';

  for (const sourcePath of sourcePaths) {
    const shortNameCheck = checkPathForShortNames(sourcePath);
    const sourceName = path.basename(sourcePath);

    // Check if source is a file or directory
    const stats = statSync(sourcePath);

    if (stats.isDirectory()) {
      // It's a directory - scan it
      const { files, totalSize: sourceSize, hasShortNamesInFiles, problematicFiles, maxPathLength: sourceMaxPath } = await scanDirectory(sourcePath);

      // Prefix problematic files with source name
      const prefixedProblematic = problematicFiles.map(pf => ({
        ...pf,
        path: `${sourceName}/${pf.path}`,
        fullPath: pf.fullPath
      }));

      totalFiles += files.length;
      totalSize += sourceSize;

      if (sourceMaxPath > maxPathLength) {
        maxPathLength = sourceMaxPath;
        longestPath = files.find(f => f.pathLength === sourceMaxPath)?.fullPath || '';
      }

      if (shortNameCheck.hasShortNames || hasShortNamesInFiles) {
        hasShortNames = true;
      }

      allProblematicFiles.push(...prefixedProblematic);
    } else if (stats.isFile()) {
      // It's a file - just analyze its path length
      const pathLength = sourcePath.length;

      totalFiles += 1;
      totalSize += stats.size;

      if (pathLength > maxPathLength) {
        maxPathLength = pathLength;
        longestPath = sourcePath;
      }

      // Check if this file path has issues
      if (pathLength > MAX_SAFE_PATH_LENGTH || shortNameCheck.hasShortNames) {
        allProblematicFiles.push({
          path: sourceName,
          fullPath: sourcePath,
          length: pathLength,
          hasShortName: shortNameCheck.hasShortNames
        });
      }

      if (shortNameCheck.hasShortNames) {
        hasShortNames = true;
      }
    }
  }

  // Determine if safe for direct transfer
  const isSafeForDirectTransfer = !hasShortNames && allProblematicFiles.length === 0;
  const needsPreparation = !isSafeForDirectTransfer;

  let riskLevel = 'ok';
  if (maxPathLength > MAX_INTERNAL_PATH_DANGER || hasShortNames) {
    riskLevel = 'danger';
  } else if (maxPathLength > MAX_INTERNAL_PATH_WARNING) {
    riskLevel = 'warning';
  }

  let shortNameWarning = null;
  if (hasShortNames) {
    shortNameWarning = 'Un ou plusieurs dossiers/fichiers sources contiennent des noms courts Windows (format 8.3 comme PROGRA~1). Cela indique que les chemins sont probablement trop longs. Risque élevé de problèmes lors de l\'extraction.';
  }

  return {
    maxInternalPathLength: maxPathLength,
    maxPathLength,
    riskLevel,
    totalFiles,
    totalSize,
    longestPath,
    hasShortNames,
    shortNameWarning,
    isSafeForDirectTransfer,
    needsPreparation,
    problematicFiles: allProblematicFiles
  };
}

module.exports = {
  createJobDirectory,
  createJobDirectoryMultiple,
  copySourceToStaging,
  copyMultipleSourcesToStaging,
  createZipFromData,
  saveZipToDestination,
  listJobs,
  cleanupOldJobs,
  analyzeSourcePath,
  analyzeMultipleSources,
  getStagingRoot,
  createDirectZipFromSource
};
