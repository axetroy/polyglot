import { Command } from 'commander';
import * as polyglot from '@polyglot/sdk';

const program = new Command();

program
  .name('polyglot')
  .description('Polyglot File Engine - Create and inspect dual-format files')
  .version('0.1.0');

program
  .command('create')
  .description('Create a polyglot file')
  .requiredOption('--front <path>', 'Path to front format file (PNG/JPEG)')
  .option('--back <format>', 'Back archive format', 'zip')
  .option('--add <name:data>', 'Add entry to archive (can be repeated)', collectEntries, [])
  .requiredOption('--output <path>', 'Output path for polyglot file')
  .action(async (options) => {
    try {
      const file = await polyglot.polyglot.create({
        front: options.front,
        back: {
          format: options.back,
          entries: options.add.length > 0 ? options.add : [{ name: 'empty.txt', data: Buffer.from('') }],
        },
      });
      await file.write(options.output);
      console.log(`Created polyglot file: ${options.output}`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('inspect')
  .description('Inspect a polyglot file')
  .argument('<path>', 'Path to file')
  .action(async (path) => {
    try {
      const info = await polyglot.polyglot.inspect(path);
      if (info.polyglot) {
        console.log('Polyglot: true');
        if (info.front) {
          console.log(`Front: ${info.front.format.toUpperCase()}`);
          console.log(`Front size: ${info.front.size} bytes`);
        }
        if (info.back) {
          console.log(`Back: ${info.back.format.toUpperCase()}`);
          console.log(`Back entries: ${info.back.entries}`);
        }
      } else {
        console.log('Polyglot: false');
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List archive entries in a polyglot file')
  .argument('<path>', 'Path to polyglot file')
  .action(async (path) => {
    try {
      const archive = await polyglot.polyglot.openBack(path);
      const entries = await archive.list();
      for (const entry of entries) {
        console.log(entry);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('extract')
  .description('Extract archive entries from a polyglot file')
  .argument('<path>', 'Path to polyglot file')
  .argument('<output-dir>', 'Output directory')
  .action(async (path, outputDir) => {
    try {
      const fs = await import('fs/promises');
      await fs.mkdir(outputDir, { recursive: true });
      const archive = await polyglot.polyglot.openBack(path);
      const entries = await archive.list();
      for (const name of entries) {
        // Sanitize path to prevent directory traversal
        const safeName = name.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
        if (!safeName || safeName.startsWith('.')) {
          console.warn(`Skipping suspicious entry: ${name}`);
          continue;
        }
        const data = await archive.read(name);
        const outPath = `${outputDir}/${safeName}`;
        await fs.mkdir(new URL(outPath, import.meta.url).pathname, { recursive: true });
        await fs.writeFile(outPath, data);
        console.log(`Extracted: ${safeName}`);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

function collectEntries(value: string, previous: { name: string; data: Buffer }[]): { name: string; data: Buffer }[] {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) {
    return [...previous, { name: value, data: Buffer.from('') }];
  }
  const name = value.slice(0, colonIndex);
  const data = Buffer.from(value.slice(colonIndex + 1));
  return [...previous, { name, data }];
}

program.parse();
