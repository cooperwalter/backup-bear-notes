Back up your Bear Notes as markdown files.

# Requirements

Requires [Node.js](https://nodejs.org/). See the [official download page](https://nodejs.org/en/download/) for installation instructions.

# Usage

```sh
npx @cooperwalter/backup-bear-notes ./my-backup-location
```

Use the `--use-tags-as-directories` flag to organize notes into folders by tag:

```sh
npx @cooperwalter/backup-bear-notes ./my-backup-location --use-tags-as-directories
```

# Features

- Handles duplicate note titles by appending numeric suffixes (-1, -2, etc.)
- Handles empty or whitespace-only titles gracefully
- Optional tag-based directory organization

# Development

```sh
npm install
npm run backup -- <output-directory>
```

## Testing

```sh
npm test                 # run tests
npm run test:watch       # watch mode
npm run test:coverage    # with coverage
```

# License

[WTFPL](https://wtfpl2.com)
