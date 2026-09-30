import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'artifacts/bob-saba-2026-09-30/saba-two-methods-demo');
await mkdir(path.join(output,'models'),{recursive:true});
const inputs={
  original:'public/models/characters/saba.glb',
  prototype:'artifacts/bob-saba-2026-09-30/rigged/saba/saba-wardrobe.glb',
};
const assets={},sources={};
for(const [id,relative] of Object.entries(inputs)){
  const bytes=await readFile(path.join(root,relative));
  assets[id]=bytes.toString('base64');
  sources[id]={path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
  await copyFile(path.join(root,relative),path.join(output,'models',`${id}-saba.glb`));
}
const result=await build({
  entryPoints:[path.join(root,'scripts/assets/saba-comparison.ts')],bundle:true,
  write:false,minify:true,format:'iife',target:'es2022',platform:'browser',
});
const template=await readFile(path.join(root,'scripts/assets/saba-comparison.html'),'utf8');
const html=template.replace('<!-- ASSET_DATA -->',()=>`<script>window.sabaAssets=${JSON.stringify(assets)};</script>`)
  .replace('<!-- APP_SCRIPT -->',()=>`<script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
await writeFile(path.join(output,'preview.html'),html);
await writeFile(path.join(output,'demo-manifest.json'),JSON.stringify({
  schema:'saba-two-methods-demo/v1',createdAt:new Date().toISOString(),
  subject:'Saba',sources,entry:'preview.html',
  entries:{comparison:'preview.html#split',original:'preview.html#original',prototype:'preview.html#prototype'},
  timing:{fixedStep:1/60,synchronized:true},
  motion:'Current Athlete match controller; prototype receives matching joints through a demo-only coordinate adapter.',
  preservation:'Model files copied byte-for-byte. No source geometry, textures or weights rewritten.',
  limitations:['Not final match acceptance','Prototype-only skirt helpers follow pelvis','Only B has replaceable outfits',
    'Original A uses its existing grip morph; B retains its original open hand mesh'],
  externalGenerationCredits:0,
},null,2));
console.log(path.join(output,'preview.html'));
