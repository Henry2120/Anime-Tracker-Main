/**
 * Script to generate/update the Blue Archive character manifest
 * Run with: node scripts/generate_ba_manifest.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

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

  const manifest = glbFiles.map((filename, idx) => {
    const baseName = filename.replace(/\.glb$/, '');
    const id =
      (baseName
        .toLowerCase()
        .replace(/[\s\(\)\+]+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
        .replace(/^-+|-+$/g, '') || `char-${idx}`) + `-${idx + 1}`;

    const encodedFilename = encodeURIComponent(filename);
    const remoteUrl = `https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/${encodedFilename}`;

    return {
      id,
      name: baseName,
      filename,
      url: remoteUrl,
    };
  });

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
`;

  fs.writeFileSync(path.join(targetDir, 'blueArchiveCharacters.ts'), tsContent, 'utf8');
  console.log(`Successfully generated src/data/blueArchiveCharacters.ts with ${manifest.length} characters.`);
}

run().catch((err) => {
  console.error('Error generating manifest:', err);
  process.exit(1);
});
