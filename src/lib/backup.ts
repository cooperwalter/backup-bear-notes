import path from 'node:path';
import buildFilename from '../build-filename.js';
import type {
  NoteRow,
  FileRow,
  ProcessedNote,
  BackupOptions,
} from '../types/index.js';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'tiff', 'svg', 'bmp']);
const CORE_DATA_EPOCH_SECONDS = Date.UTC(2001, 0, 1) / 1000;

function getSourceFilePath(localFilesPath: string, uuid: string, filename: string, extension: string | null): string {
  const folder = IMAGE_EXTENSIONS.has((extension || '').toLowerCase())
    ? 'Note Images'
    : 'Note Files';
  return path.join(localFilesPath, folder, uuid, filename);
}

function buildAssetFilename(uuid: string, filename: string): string {
  const MAX_BYTES = 255;
  const prefix = uuid.substring(0, 8) + '-';
  const prefixBytes = Buffer.byteLength(prefix, 'utf8');
  const maxNameBytes = MAX_BYTES - prefixBytes;

  let truncated = filename;
  while (Buffer.byteLength(truncated, 'utf8') > maxNameBytes) {
    truncated = truncated.slice(0, -1);
  }

  return prefix + truncated;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bearEncode(str: string): string {
  return str.replace(/ /g, '%20');
}

function rewriteAssetReferences(text: string | null, fileMap: Record<string, string>, assetPrefix: string): string | null {
  if (!text || Object.keys(fileMap).length === 0) {
    return text;
  }

  let result = text;

  for (const [originalFilename, newAssetFilename] of Object.entries(fileMap)) {
    const fullUrlEncoded = encodeURIComponent(originalFilename);
    const bearEncoded = bearEncode(originalFilename);
    const newPath = assetPrefix + bearEncode(newAssetFilename);

    const patterns = [
      escapeRegex(fullUrlEncoded),
      escapeRegex(bearEncoded),
      escapeRegex(originalFilename),
    ];

    for (const pattern of patterns) {
      const imgRegex = new RegExp(`(!\\[[^\\]]*\\]\\()${pattern}(\\))`, 'g');
      result = result.replace(imgRegex, `$1${newPath}$2`);

      const linkRegex = new RegExp(`(\\[[^\\]]*\\]\\()${pattern}(\\)(?:<!--[^>]*-->)?)`, 'g');
      result = result.replace(linkRegex, `$1${newPath}$2`);
    }
  }

  return result;
}

function insertSuffix(filename: string, suffixNum: number): string {
  const MAX_BYTES = 255;
  const extension = '.md';
  const suffix = `-${suffixNum}`;
  const baseName = filename.slice(0, -3);

  const suffixBytes = Buffer.byteLength(suffix, 'utf8');
  const maxBaseBytes = MAX_BYTES - suffixBytes - 3;

  let truncatedBase = baseName;
  while (Buffer.byteLength(truncatedBase, 'utf8') > maxBaseBytes) {
    truncatedBase = truncatedBase.slice(0, -1);
  }

  return truncatedBase + suffix + extension;
}

function deduplicateFilenames(rows: NoteRow[], outputDirectory: string, useTagsAsDirectories: boolean): ProcessedNote[] {
  const filenameCounters: Record<string, Record<string, number>> = {};

  return rows.map((row) => {
    const destinationDirectory = !useTagsAsDirectories
      ? outputDirectory
      : path.join(outputDirectory, row.tag || 'untagged');

    const baseFilename = buildFilename(row.title, row.id);

    if (!filenameCounters[destinationDirectory]) {
      filenameCounters[destinationDirectory] = {};
    }

    const dirCounters = filenameCounters[destinationDirectory];
    let finalFilename: string;

    if (!(baseFilename in dirCounters)) {
      dirCounters[baseFilename] = 1;
      finalFilename = baseFilename;
    } else {
      finalFilename = insertSuffix(baseFilename, dirCounters[baseFilename]);
      dirCounters[baseFilename]++;
    }

    return { ...row, filename: finalFilename, destinationDirectory };
  });
}

interface NodeError extends Error {
  code?: string;
}

async function backup(outputDirectory: string, options: BackupOptions): Promise<ProcessedNote[]> {
  const {
    useTagsAsDirectories = false,
    sqlite,
    makeDir,
    fs,
    dbPath,
    localFilesPath,
  } = options;

  if (!sqlite || !makeDir || !fs || !dbPath) {
    throw new Error('Missing required dependencies: sqlite, makeDir, fs, dbPath');
  }

  await makeDir(outputDirectory);

  const assetsDirectory = path.join(outputDirectory, 'assets');
  if (localFilesPath) {
    await makeDir(assetsDirectory);
  }

  const db = await sqlite.open(dbPath);

  const rows = await db.all<NoteRow>(`
    SELECT
      ZSFNOTE.Z_PK AS id,
      ZSFNOTE.ZTITLE AS title,
      ZSFNOTE.ZTEXT AS text,
      ZSFNOTETAG.ZTITLE AS tag,
      ZSFNOTE.ZTRASHED AS trashed,
      ZSFNOTE.ZMODIFICATIONDATE AS modificationDate
    FROM
      ZSFNOTE
    LEFT JOIN Z_5TAGS ON ZSFNOTE.Z_PK = Z_5TAGS.Z_5NOTES
    LEFT JOIN ZSFNOTETAG ON Z_5TAGS.Z_13TAGS = ZSFNOTETAG.Z_PK
    ORDER BY LENGTH(tag)`);

  let filesByNoteId: Record<number, FileRow[]> = {};
  if (localFilesPath) {
    const fileRows = await db.all<FileRow>(`
      SELECT
        ZSFNOTEFILE.ZNOTE AS noteId,
        ZSFNOTEFILE.ZUNIQUEIDENTIFIER AS uuid,
        ZSFNOTEFILE.ZFILENAME AS filename,
        ZSFNOTEFILE.ZNORMALIZEDFILEEXTENSION AS extension
      FROM ZSFNOTEFILE
      WHERE ZSFNOTEFILE.ZNOTE IS NOT NULL`);

    for (const file of fileRows) {
      if (!filesByNoteId[file.noteId]) {
        filesByNoteId[file.noteId] = [];
      }
      filesByNoteId[file.noteId].push(file);
    }
  }

  if (useTagsAsDirectories) {
    const tags = Array.from(new Set(rows.map((row) => row.tag)));

    await Promise.all(tags.map((tag) => {
      const tagDirectory = tag ? tag : 'untagged';

      return makeDir(path.join(outputDirectory, tagDirectory));
    }));
  }

  const processedNotes = deduplicateFilenames(rows, outputDirectory, useTagsAsDirectories);

  const assetPrefix = useTagsAsDirectories ? '../assets/' : 'assets/';

  const copiedUuids = new Set<string>();
  const fileCopyPromises: Promise<void>[] = [];

  const noteWritePromises = processedNotes.map(({ filename, text, destinationDirectory, trashed, id, modificationDate }) => {
    if (trashed) {
      return fs.unlink(path.join(destinationDirectory, filename))
        .catch((error: unknown) => {
          if ((error as NodeError).code !== 'ENOENT') {
            throw error;
          }
        });
    }

    const noteFiles = filesByNoteId[id] || [];
    const fileMap: Record<string, string> = {};

    for (const file of noteFiles) {
      if (!file.uuid || !file.filename) continue;
      const newFilename = buildAssetFilename(file.uuid, file.filename);
      fileMap[file.filename] = newFilename;

      if (!copiedUuids.has(file.uuid)) {
        copiedUuids.add(file.uuid);
        const sourcePath = getSourceFilePath(localFilesPath!, file.uuid, file.filename, file.extension);
        const destPath = path.join(assetsDirectory, newFilename);

        const copyPromise = fs.copyFile(sourcePath, destPath)
          .catch((error: unknown) => {
            if ((error as NodeError).code !== 'ENOENT') {
              throw error;
            }
          });
        fileCopyPromises.push(copyPromise);
      }
    }

    const rewrittenText = rewriteAssetReferences(text, fileMap, assetPrefix);
    const filePath = path.join(destinationDirectory, filename);
    return fs.writeFile(filePath, rewrittenText, { encoding: 'utf8' })
      .then(async () => {
        if (modificationDate != null) {
          const mtime = new Date((modificationDate + CORE_DATA_EPOCH_SECONDS) * 1000);
          await fs.utimes(filePath, mtime, mtime);
        }
      });
  });

  await Promise.all([...noteWritePromises, ...fileCopyPromises]);

  return processedNotes;
}

export { backup };
