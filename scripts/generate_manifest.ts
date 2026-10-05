import fs from 'fs';
import path from 'path';
import https from 'https';

function fetchUrl(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function createDisplayName(filename: string): string {
  // Strip .glb extension
  let name = filename.replace(/\.glb$/i, '');
  
  // Handle special technical file names if any, e.g. sm030001 -> SM030001
  if (/^[a-z]{2}\d+$/i.test(name)) {
    return name.toUpperCase();
  }
  
  // Replace underscores with spaces for ladies_biker_ar -> Ladies Biker AR
  if (name.includes('_')) {
    name = name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  return name;
}

function createSlugId(filename: string, index: number): string {
  let slug = filename
    .replace(/\.glb$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = `char-${index + 1}`;
  return slug;
}

async function run() {
  console.log('Fetching tree from GitHub API...');
  const tree = await fetchUrl('https://api.github.com/repos/Henry2120/AniVerse-BlueArchive-Assets/git/trees/main?recursive=1');
  const glbFiles: { path: string; size?: number }[] = (tree.tree || []).filter((item: any) => item.path.endsWith('.glb'));

  console.log(`Found ${glbFiles.length} .glb files`);

  const idMap = new Set<string>();
  const manifest = glbFiles.map((item, idx) => {
    const filename = item.path;
    let id = createSlugId(filename, idx);
    if (idMap.has(id)) {
      id = `${id}-${idx + 1}`;
    }
    idMap.add(id);

    const displayName = createDisplayName(filename);

    // Properly encode filename for GitHub media URL
    // encodeURIComponent encodes spaces as %20, ( as %28, ) as %29, etc.
    const encodedFilename = encodeURIComponent(filename).replace(/%2F/g, '/');
    const url = `https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/${encodedFilename}`;

    return {
      id,
      displayName,
      filename,
      url,
      fileSize: item.size || 0,
    };
  });

  console.log('Manifest entries count:', manifest.length);

  const outputPath = path.join(process.cwd(), 'src/data/blueArchiveManifest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Saved manifest to ${outputPath}`);

  // Sample outputs
  console.log('\nSample Manifest Entries:');
  console.log(JSON.stringify(manifest.slice(0, 5), null, 2));
  console.log(JSON.stringify(manifest.slice(140, 143), null, 2));
  console.log(JSON.stringify(manifest.slice(-3), null, 2));
}

run().catch(console.error);
