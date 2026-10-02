// Generated fixtures go ONLY into androidTest, never into the delivered APK.
import {readFile,mkdir,writeFile,copyFile} from "node:fs/promises";
import path from "node:path";
const root=process.cwd(),destination=path.join(root,"android/app/src/androidTest/assets/demo");
const all=JSON.parse(await readFile(path.join(root,"data/photos.json"),"utf8")).photos;
const photos=all.filter(p=>p.location.lat).slice(0,6);
if(photos.length!==6)throw Error("Need six public visual test fixtures");
await mkdir(destination,{recursive:true});
for(const [index,p]of photos.entries()){
 if(!/^\/thumbnails\/[^/]+\.jpg$/.test(p.thumbnail))throw Error("Invalid fixture");
 await copyFile(path.join(root,"public",p.thumbnail),path.join(destination,index+".jpg"));
}
await writeFile(path.join(destination,"photos.json"),JSON.stringify(photos));
console.log("Prepared 6 public photos for the disposable Android test APK only.");
