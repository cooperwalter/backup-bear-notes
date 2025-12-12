const path = require('path')
const buildFilename = require('../build-filename')

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'tiff', 'svg', 'bmp'])
const CORE_DATA_EPOCH_SECONDS = Date.UTC(2001, 0, 1) / 1000

function getSourceFilePath(localFilesPath, uuid, filename, extension) {
	const folder = IMAGE_EXTENSIONS.has((extension || '').toLowerCase())
		? 'Note Images'
		: 'Note Files'
	return path.join(localFilesPath, folder, uuid, filename)
}

function buildAssetFilename(uuid, filename) {
	const MAX_BYTES = 255
	const prefix = uuid.substring(0, 8) + '-'
	const prefixBytes = Buffer.byteLength(prefix, 'utf8')
	const maxNameBytes = MAX_BYTES - prefixBytes

	let truncated = filename
	while (Buffer.byteLength(truncated, 'utf8') > maxNameBytes) {
		truncated = truncated.slice(0, -1)
	}

	return prefix + truncated
}

function escapeRegex(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function bearEncode(str) {
	return str.replace(/ /g, '%20')
}

function rewriteAssetReferences(text, fileMap, assetPrefix) {
	if (!text || Object.keys(fileMap).length === 0) {
		return text
	}

	let result = text

	for (const [originalFilename, newAssetFilename] of Object.entries(fileMap)) {
		const fullUrlEncoded = encodeURIComponent(originalFilename)
		const bearEncoded = bearEncode(originalFilename)
		const newPath = assetPrefix + bearEncode(newAssetFilename)

		const patterns = [
			escapeRegex(fullUrlEncoded),
			escapeRegex(bearEncoded),
			escapeRegex(originalFilename),
		]

		for (const pattern of patterns) {
			const imgRegex = new RegExp(`(!\\[[^\\]]*\\]\\()${pattern}(\\))`, 'g')
			result = result.replace(imgRegex, `$1${newPath}$2`)

			const linkRegex = new RegExp(`(\\[[^\\]]*\\]\\()${pattern}(\\)(?:<!--[^>]*-->)?)`, 'g')
			result = result.replace(linkRegex, `$1${newPath}$2`)
		}
	}

	return result
}

function insertSuffix(filename, suffixNum) {
	const MAX_BYTES = 255
	const extension = '.md'
	const suffix = `-${suffixNum}`
	const baseName = filename.slice(0, -3)

	const suffixBytes = Buffer.byteLength(suffix, 'utf8')
	const maxBaseBytes = MAX_BYTES - suffixBytes - 3

	let truncatedBase = baseName
	while (Buffer.byteLength(truncatedBase, 'utf8') > maxBaseBytes) {
		truncatedBase = truncatedBase.slice(0, -1)
	}

	return truncatedBase + suffix + extension
}

function deduplicateFilenames(rows, outputDirectory, useTagsAsDirectories) {
	const filenameCounters = {}

	return rows.map(row => {
		const destinationDirectory = !useTagsAsDirectories
			? outputDirectory
			: path.join(outputDirectory, row.tag || 'untagged')

		const baseFilename = buildFilename(row.title, row.id)

		if (!filenameCounters[destinationDirectory]) {
			filenameCounters[destinationDirectory] = {}
		}

		const dirCounters = filenameCounters[destinationDirectory]
		let finalFilename

		if (!(baseFilename in dirCounters)) {
			dirCounters[baseFilename] = 1
			finalFilename = baseFilename
		} else {
			finalFilename = insertSuffix(baseFilename, dirCounters[baseFilename])
			dirCounters[baseFilename]++
		}

		return { ...row, filename: finalFilename, destinationDirectory }
	})
}

async function backup(outputDirectory, options = {}) {
	const {
		useTagsAsDirectories = false,
		sqlite,
		makeDir,
		fs,
		dbPath,
		localFilesPath,
	} = options

	if (!sqlite || !makeDir || !fs || !dbPath) {
		throw new Error('Missing required dependencies: sqlite, makeDir, fs, dbPath')
	}

	await makeDir(outputDirectory)

	const assetsDirectory = path.join(outputDirectory, 'assets')
	if (localFilesPath) {
		await makeDir(assetsDirectory)
	}

	const db = await sqlite.open(dbPath)

	const rows = await db.all(`
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
		ORDER BY LENGTH(tag)`)

	let filesByNoteId = {}
	if (localFilesPath) {
		const fileRows = await db.all(`
			SELECT
				ZSFNOTEFILE.ZNOTE AS noteId,
				ZSFNOTEFILE.ZUNIQUEIDENTIFIER AS uuid,
				ZSFNOTEFILE.ZFILENAME AS filename,
				ZSFNOTEFILE.ZNORMALIZEDFILEEXTENSION AS extension
			FROM ZSFNOTEFILE
			WHERE ZSFNOTEFILE.ZNOTE IS NOT NULL`)

		for (const file of fileRows) {
			if (!filesByNoteId[file.noteId]) {
				filesByNoteId[file.noteId] = []
			}
			filesByNoteId[file.noteId].push(file)
		}
	}

	if (useTagsAsDirectories) {
		const tags = Array.from(new Set(rows.map(row => row.tag)))

		await Promise.all(tags.map(tag => {
			const tagDirectory = tag ? tag : 'untagged'

			return makeDir(path.join(outputDirectory, tagDirectory))
		}))
	}

	const processedNotes = deduplicateFilenames(rows, outputDirectory, useTagsAsDirectories)

	const assetPrefix = useTagsAsDirectories ? '../assets/' : 'assets/'

	const copiedUuids = new Set()
	const fileCopyPromises = []

	const noteWritePromises = processedNotes.map(({ filename, text, destinationDirectory, trashed, id, modificationDate }) => {
		if (trashed) {
			return fs.unlink(path.join(destinationDirectory, filename))
				.catch(error => {
					if (error.code !== 'ENOENT') {
						throw error
					}
				})
		}

		const noteFiles = filesByNoteId[id] || []
		const fileMap = {}

		for (const file of noteFiles) {
			if (!file.uuid || !file.filename) continue
			const newFilename = buildAssetFilename(file.uuid, file.filename)
			fileMap[file.filename] = newFilename

			if (!copiedUuids.has(file.uuid)) {
				copiedUuids.add(file.uuid)
				const sourcePath = getSourceFilePath(localFilesPath, file.uuid, file.filename, file.extension)
				const destPath = path.join(assetsDirectory, newFilename)

				const copyPromise = fs.copyFile(sourcePath, destPath)
					.catch(error => {
						if (error.code !== 'ENOENT') {
							throw error
						}
					})
				fileCopyPromises.push(copyPromise)
			}
		}

		const rewrittenText = rewriteAssetReferences(text, fileMap, assetPrefix)
		const filePath = path.join(destinationDirectory, filename)
		return fs.writeFile(filePath, rewrittenText, { encoding: 'utf8' })
			.then(() => {
				if (modificationDate != null) {
					const mtime = new Date((modificationDate + CORE_DATA_EPOCH_SECONDS) * 1000)
					return fs.utimes(filePath, mtime, mtime)
				}
			})
	})

	await Promise.all([...noteWritePromises, ...fileCopyPromises])

	return processedNotes
}

module.exports = { backup }
