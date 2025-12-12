# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

backup-bear-notes is a CLI tool that backs up Bear Notes (macOS note-taking app) to markdown files. It reads directly from Bear's SQLite database and exports notes as `.md` files.

## Commands

- **Run tests:** `npm test` or `node test.js`
- **Install globally for development:** `npm link`
- **Run the tool:** `backup-bear-notes <output-directory>` (after global install)
- **Run directly:** `node index.js <output-directory>`

## Architecture

The codebase is minimal with three files:

- `index.js` - Main entry point and CLI. Reads Bear's SQLite database from `~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite`, queries notes with their tags, and writes them as markdown files. Supports `--use-tags-as-directories` flag to organize notes by tag.
- `build-filename.js` - Utility that converts note titles to safe filenames (replaces `/` with `-`, adds `.md` extension).
- `test.js` - Simple assertion-based test for `build-filename.js`.

## Bear Database Schema

The tool queries three tables:
- `ZSFNOTE` - Notes table (ZTITLE, ZTEXT, ZTRASHED)
- `ZSFNOTETAG` - Tags table (ZTITLE)
- `Z_7TAGS` - Junction table linking notes to tags (Z_7NOTES, Z_14TAGS)
