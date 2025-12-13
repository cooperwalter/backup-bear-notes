# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

backup-bear-notes is a CLI tool that backs up Bear Notes (macOS note-taking app) to markdown files. It reads directly from Bear's SQLite database and exports notes as `.md` files.

## Commands

- **Run without building:** `npm start -- <output-directory>` (uses tsx to run TypeScript directly)
- **Build:** `npm run build` (compiles TypeScript to dist/)
- **Run tests:** `npm test`
- **Type check:** `npm run typecheck`
- **Install globally for development:** `npm link`
- **Run the tool:** `backup-bear-notes <output-directory>` (after global install)
- **Run directly:** `node dist/index.js <output-directory>`

## Architecture

TypeScript ES modules project with source in `src/` and compiled output in `dist/`.

### Source Files (`src/`)

- `index.ts` - CLI entry point with shebang. Parses command-line arguments, reads Bear's SQLite database, and orchestrates the backup process. Supports `--use-tags-as-directories` flag.
- `build-filename.ts` - Utility that converts note titles to safe filenames (replaces `/` with `-`, truncates to 255 bytes, adds `.md` extension).
- `lib/backup.ts` - Core backup logic. Queries the database, handles filename deduplication, copies assets, rewrites asset references in markdown, and preserves modification dates.
- `types/index.ts` - TypeScript interfaces for database rows, backup options, and dependency injection.

### Test Files (`__tests__/`)

- `build-filename.test.ts` - Tests for filename utility
- `backup.test.ts` - Tests for core backup logic (uses Vitest with mocked dependencies)

### Configuration

- `tsconfig.json` - TypeScript config (ES2022 target, NodeNext modules, strict mode)
- `vitest.config.ts` - Test configuration

## Bear Database Schema

The tool queries these tables:
- `ZSFNOTE` - Notes table (Z_PK, ZTITLE, ZTEXT, ZTRASHED, ZMODIFICATIONDATE)
- `ZSFNOTETAG` - Tags table (Z_PK, ZTITLE)
- `Z_5TAGS` - Junction table linking notes to tags (Z_5NOTES, Z_13TAGS)
- `ZSFNOTEFILE` - File attachments (ZNOTE, ZUNIQUEIDENTIFIER, ZFILENAME, ZNORMALIZEDFILEEXTENSION)
