import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(projectRoot, 'node_modules', 'cesium', 'Build', 'Cesium');
const target = join(projectRoot, 'dist', 'vendor', 'cesium');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const name of ['Assets', 'ThirdParty', 'Widgets', 'Workers']) {
  await cp(join(source, name), join(target, name), { recursive: true });
}
await cp(join(source, 'Cesium.js'), join(target, 'Cesium.js'));
await cp(join(projectRoot, 'node_modules', 'cesium', 'LICENSE.md'), join(target, 'LICENSE.md'));

console.log('CesiumJS und Natural-Earth-Textur wurden nach dist/vendor/cesium kopiert.');
