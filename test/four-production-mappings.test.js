import test from "node:test";
import { resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";

const rows = [
 {id:217282,format:"TV_SHORT",startDate:{year:2026},title:{english:null,romaji:"GelPiyo 2",native:"ゲルぴよ 2"},synonyms:[]},
 {id:216625,format:"ONA",startDate:{year:2026},title:{english:"PokéOki SEASON 2",romaji:"PokéOki SEASON 2",native:"ポケ起き SEASON 2"},synonyms:[]},
 {id:235,format:"TV",startDate:{year:1996},title:{english:"Detective Conan",romaji:"Meitantei Conan",native:"名探偵コナン"},synonyms:["Case Closed"]},
 {id:191832,format:"ONA",startDate:{year:2026},title:{english:"Link Click Season 3",romaji:"Shiguang Dailiren III",native:"时光代理人 第三季"},synonyms:[]},
];
import { resolveAniListMappings as arm } from "../lib/arm-mapping.js";
import { resolveAniListMappingsFribb as fribb } from "../lib/fribb-mapping.js";
import { resolveAniListExternalMappings as external } from "../lib/external-provider-mapping.js";
import { resolveAniListMappingsByAniBridge as anibridge } from "../lib/anibridge-mapping.js";
import { resolveAniListMappingsAnimap as animap } from "../lib/animap-mapping.js";
import { resolveAniListMappingsIdMapper as idmapper } from "../lib/idmapper-mapping.js";
import { resolveAniListMappingsByAnimeMapper as animeMapper } from "../lib/anime-mapper-mapping.js";
import { resolveAniListMappingsFromAnimeApiTsv as tsv } from "../lib/animeapi-tsv-mapping.js";
import { resolveAniListMappingsSecondary as secondary } from "../lib/secondary-mapping.js";

test("current main IMDb resolver investigation",async()=>{
 const r=await resolveAniListMappingsByImdbSearch(rows);
 for(const x of rows) console.log(JSON.stringify({id:x.id,title:x.title,result:r.get(x.id)||null}));
});

test("source diagnostics",async()=>{
 const sources=[
 ["arm",()=>arm(rows.map(x=>x.id))],["fribb",()=>fribb(rows.map(x=>x.id))],["external",()=>external(rows)],
 ["anibridge",()=>anibridge(rows)],["animap",()=>animap(rows.map(x=>x.id))],["idmapper",()=>idmapper(rows.map(x=>x.id))],
 ["anime-mapper",()=>animeMapper(rows)],["tsv",()=>tsv(rows)],["imdb",()=>resolveAniListMappingsByImdbSearch(rows)],["secondary",()=>secondary(rows.map(x=>x.id))]
 ];
 for(const [name,run] of sources){try{const m=await run();console.log(JSON.stringify({source:name,records:rows.map(x=>({id:x.id,records:(m.get(x.id)||[]).map(r=>({source:r.source,imdbIds:r.imdbIds,title:r.title,titles:r.titles,year:r.year,derivedTitle:r.derivedTitle,derivedSearchTitle:r.derivedSearchTitle,relation:r.relation}))}))}));}catch(e){console.log(JSON.stringify({source:name,error:String(e.message||e)}));}}
});

test("provider candidate validation diagnostics",async()=>{
 const q=`query($id:Int){Media(id:$id,type:ANIME){id format title{english romaji native} synonyms startDate{year} relations{edges{relationType node{id title{english romaji native} externalLinks{site url}}}}}}`;
 for(const id of [235,191832]){
  const rr=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:q,variables:{id}})});
  const media=(await rr.json()).data.Media;
  const sources=[["arm",()=>arm([id])],["fribb",()=>fribb([id])],["idmapper",()=>idmapper([id])],["tsv",()=>tsv([media])],["imdb",()=>resolveAniListMappingsByImdbSearch([media])]];
  const records=[]; for(const [n,run] of sources){try{const m=await run(); records.push(...(m.get(id)||[]));}catch{}}
  const {getProviderCandidates,selectProviderIdentity}=await import("../lib/provider-identity.js");
  const candidates=getProviderCandidates(media,records);
  console.log(JSON.stringify({id,title:media.title,candidates:candidates.map(x=>({provider:x.provider,id:x.id,sources:x.evidence?.map(e=>e.source),related:x.relatedProviderIds,relatedTitles:x.relatedProviderTitles,corroborated:x.corroborated,direct:x.directlyCorroborated,semantic:x.semanticCompatibleEvidence,validation:selectProviderIdentity(media,[x])?.validation||null}))}));
 }
});

test("full canonical production replay",async()=>{
 const q=`query($id:Int){Media(id:$id,type:ANIME){id idMal format title{english romaji native} synonyms startDate{year} status relations{edges{relationType node{id format title{english romaji native} synonyms startDate{year} externalLinks{site url}}}}}}`;
 const media=[]; for(const id of [217282,216625,235,191832]){const rr=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:q,variables:{id}})});media.push((await rr.json()).data.Media);}
 const {canonicalizeCatalogPage}=await import("../api/catalog-source.js");
 const metas=await canonicalizeCatalogPage(media);
 console.log(JSON.stringify(metas.map(m=>({id:m.id,anilistId:m.extra?.anilistId,identityProvider:m.extra?.identityProvider,identityId:m.extra?.identityId,identityEvidence:m.extra?.identityEvidence}))));
});

test("relation protection differential",async()=>{
 const q=`query($id:Int){Media(id:$id,type:ANIME){id idMal format title{english romaji native} synonyms startDate{year} relations{edges{relationType node{id format title{english romaji native} synonyms startDate{year} externalLinks{site url}}}}}}`;
 const {canonicalizeCatalogPage}=await import("../api/catalog-source.js");
 for(const id of [235,191832]){const rr=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:q,variables:{id}})});const media=(await rr.json()).data.Media;
  const withRelations=(await canonicalizeCatalogPage([media]))[0];
  const withoutRelations=(await canonicalizeCatalogPage([{...media,relations:{edges:[]}}]))[0];
  console.log(JSON.stringify({id,withRelations:{id:withRelations.id,evidence:withRelations.extra?.identityEvidence},withoutRelations:{id:withoutRelations.id,evidence:withoutRelations.extra?.identityEvidence}}));
 }
});
