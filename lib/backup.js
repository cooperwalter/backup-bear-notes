const path = require('path')
const buildFilename = require('../build-filename')

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
	} = options

	if (!sqlite || !makeDir || !fs || !dbPath) {
		throw new Error('Missing required dependencies: sqlite, makeDir, fs, dbPath')
	}

	await makeDir(outputDirectory)

	const db = await sqlite.open(dbPath)

	const rows = await db.all(`
		SELECT
			ZSFNOTE.Z_PK AS id,
			ZSFNOTE.ZTITLE AS title,
			ZSFNOTE.ZTEXT AS text,
			ZSFNOTETAG.ZTITLE AS tag,
			ZSFNOTE.ZTRASHED AS trashed
		FROM
			ZSFNOTE
		LEFT JOIN Z_5TAGS ON ZSFNOTE.Z_PK = Z_5TAGS.Z_5NOTES
		LEFT JOIN ZSFNOTETAG ON Z_5TAGS.Z_13TAGS = ZSFNOTETAG.Z_PK
		ORDER BY LENGTH(tag)`)

	if (useTagsAsDirectories) {
		const tags = Array.from(new Set(rows.map(row => row.tag)))

		await Promise.all(tags.map(tag => {
			const tagDirectory = tag ? tag : 'untagged'

			return makeDir(path.join(outputDirectory, tagDirectory))
		}))
	}

	const processedNotes = deduplicateFilenames(rows, outputDirectory, useTagsAsDirectories)

	return Promise.all(
		processedNotes.map(({ filename, text, destinationDirectory, trashed }) => {
			if (trashed) {
				return fs.unlink(path.join(destinationDirectory, filename))
					.catch(error => {
						if (error.code !== 'ENOENT') {
							throw error
						}
					})
			}

			return fs.writeFile(path.join(destinationDirectory, filename), text, { encoding: 'utf8' })
		})
	)
}

module.exports = { backup }
