import fs from 'node:fs';
import {NtExecutable,NtExecutableResource} from 'pe-library';
import {Resource,Data} from 'resedit';
const [source,output,iconPath]=process.argv.slice(2);
const image=NtExecutable.from(fs.readFileSync(source),{ignoreCert:true});
const resources=NtExecutableResource.from(image);
const icon=Data.IconFile.from(fs.readFileSync(iconPath));
for(const group of Resource.IconGroupEntry.fromEntries(resources.entries)) {
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries,group.id,group.lang,icon.icons.map(i=>i.data));
}
for(const version of Resource.VersionInfo.fromEntries(resources.entries)) {
  version.setFileVersion(1,0,2,0,1033);version.setProductVersion(1,0,2,0,1033);
  for(const lang of version.getAllLanguagesForStringValues())version.setStringValues(lang,{
    CompanyName:'SPaDe Corp',FileDescription:'Market Scanner',InternalName:'Market Scanner',
    OriginalFilename:'Market Scanner.exe',ProductName:'Market Scanner',LegalCopyright:'SPaDe Corp'
  });
  version.outputToResourceEntries(resources.entries);
}
resources.outputResource(image);
fs.writeFileSync(output,Buffer.from(image.generate()));
