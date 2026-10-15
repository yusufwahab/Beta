// Organize supplied recordings without transcoding or overwriting existing assets.
import {readdir,mkdir,rename,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const prompts=['welcome','name','category','business','confirm','again','ready'];
const languages={english:'en',yoruba:'yo',hausa:'ha',igbo:'ig',en:'en',yo:'yo',ha:'ha',ig:'ig'};
const withinRoot=p=>{if(!p.startsWith(root+path.sep))throw new Error('Audio path outside project');return p;};
const publicAudio=withinRoot(path.join(root,'apps/web/public/audio'));
for(const file of await readdir(root)){
 const match=/^(welcome|name|category|business|confirm|again|ready)(?:_(english|yoruba|hausa|igbo|en|yo|ha|ig))?\.(mp3|wav)$/i.exec(file);
 if(!match)continue;
 const [,prompt,suffix='english',extension]=match.map(value=>value?.toLowerCase());
 const directory=withinRoot(path.join(publicAudio,languages[suffix]));
 const source=withinRoot(path.join(root,file));
 const destination=withinRoot(path.join(directory,`${prompt}.${extension}`));
 await mkdir(directory,{recursive:true});
 if((await readdir(directory)).some(existing=>existing.toLowerCase()===`${prompt}.${extension}`))throw new Error(`Refusing to overwrite ${destination}`);
 await rename(source,destination);
 console.log(`Organized ${file} -> audio/${languages[suffix]}/${prompt}.${extension}`);
}
const manifest={};
for(const language of ['en','yo','ha','ig']){
 const directory=withinRoot(path.join(publicAudio,language));
 await mkdir(directory,{recursive:true});
 const files=await readdir(directory);
 manifest[language]={};
 for(const prompt of prompts){
  const file=[`${prompt}.mp3`,`${prompt}.wav`].find(candidate=>files.includes(candidate));
  if(file){if(!(await readFile(path.join(directory,file))).length)throw new Error(`Empty recording: ${file}`);manifest[language][prompt]=`/audio/${language}/${file}`;}
 }
 console.log(`${language}: ${Object.keys(manifest[language]).length}/7 recordings`);
}
await writeFile(withinRoot(path.join(root,'apps/web/src/onboarding-recordings.json')),JSON.stringify(manifest,null,2)+'\n');
