import { readdir,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync,brotliCompressSync,constants } from 'node:zlib';
async function compress(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const path=join(folder,entry.name);
    if(entry.isDirectory())await compress(path);
    else if(/\.(js|css|html|svg)$/.test(path)){
      const bytes=await readFile(path);
      await writeFile(path+'.gz',gzipSync(bytes,{level:9}));
      await writeFile(path+'.br',brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:9}}));
    }
  }
}
await compress('dist');console.log('Precompressed assets ready (gzip + Brotli).');
