/**
 * Script to generate/update the Blue Archive character manifest
 * Run with: node scripts/generate_ba_manifest.js
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fetchTree() {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://api.github.com/repos/Henry2120/AniVerse-BlueArchive-Assets/git/trees/main?recursive=1',
        {
          headers: { 'User-Agent': 'AniVerse-App' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on('error', reject);
  });
}

async function run() {
  console.log('Fetching asset repository tree from GitHub...');
  const res = await fetchTree();
  if (!res.tree) {
    console.error('Failed to fetch tree:', res);
    process.exit(1);
  }

  const glbFiles = res.tree.filter((f) => f.path.endsWith('.glb')).map((f) => f.path);
  console.log(`Found ${glbFiles.length} GLB files in repository.`);

  const targetDir = path.resolve(__dirname, '../src/data');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Preserve existing character entries & IDs if file exists
  const existingPath = path.join(targetDir, 'blueArchiveCharacters.ts');
  const existingMap = new Map();
  const existingList = [];
  if (fs.existsSync(existingPath)) {
    try {
      const content = fs.readFileSync(existingPath, 'utf8');
      const match = content.match(/export const BLUE_ARCHIVE_CHARACTERS:\s*CharacterManifestEntry\[\]\s*=\s*(\[[\s\S]*?\]);/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        parsed.forEach((item) => {
          existingMap.set(item.filename, item);
          existingList.push(item);
        });
        console.log(`Loaded ${existingList.length} existing entries from ${existingPath}`);
      }
    } catch (e) {
      console.warn('Could not parse existing manifest, generating fresh:', e.message);
    }
  }

  const manifest = [...existingList];
  let newAdditions = 0;

  glbFiles.forEach((filename) => {
    if (existingMap.has(filename)) {
      return; // Already registered with stable ID
    }

    const baseName = filename.replace(/\.glb$/, '');
    const cleanName = baseName.replace(/_/g, ' ');
    const nextIdx = manifest.length;
    const id =
      (baseName
        .toLowerCase()
        .replace(/[\s\(\)\+]+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
        .replace(/^-+|-+$/g, '') || `char-${nextIdx}`) + `-${nextIdx + 1}`;

    const encodedFilename = encodeURIComponent(filename);
    const remoteUrl = `https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/${encodedFilename}`;

    manifest.push({
      id,
      name: cleanName,
      filename,
      url: remoteUrl,
    });
    newAdditions++;
  });

  console.log(`Added ${newAdditions} new characters. Total manifest entries: ${manifest.length}`);

  const tsContent = `/**
 * Blue Archive 3D Character Models Manifest
 * Auto-generated from https://github.com/Henry2120/AniVerse-BlueArchive-Assets
 * Total Characters: ${manifest.length}
 */

export interface CharacterManifestEntry {
  id: string;
  name: string;
  filename: string;
  url: string;
  category?: string;
}

export const BLUE_ARCHIVE_CHARACTERS: CharacterManifestEntry[] = ${JSON.stringify(manifest, null, 2)};

export const BLUE_ARCHIVE_CHARACTER_COUNT = ${manifest.length};

export function getCharacterById(id: string): CharacterManifestEntry | undefined {
  return BLUE_ARCHIVE_CHARACTERS.find((c) => c.id === id);
}

/**
 * Dynamically register a newly discovered or uploaded Blue Archive character model
 */
export function registerAdditionalCharacter(entry: CharacterManifestEntry): boolean {
  if (BLUE_ARCHIVE_CHARACTERS.some((c) => c.filename === entry.filename || c.id === entry.id)) {
    return false;
  }
  BLUE_ARCHIVE_CHARACTERS.push(entry);
  return true;
}
`;

  fs.writeFileSync(path.join(targetDir, 'blueArchiveCharacters.ts'), tsContent, 'utf8');
  console.log(`Successfully generated src/data/blueArchiveCharacters.ts with ${manifest.length} characters.`);
}

run().catch((err) => {
  console.error('Error generating manifest:', err);
  process.exit(1);
});
