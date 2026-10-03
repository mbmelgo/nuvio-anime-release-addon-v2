import test from "node:test";
import { resolveAniListMappingsByBingeCatSearch, clearBingeCatSearchCache } from "../lib/bingecat-search-mapping.js";
test("live BingeCat resolver maps AniList 212653", async()=>{
 const q=`query{Media(id:212653){id idMal format startDate{year} title{english romaji native} synonyms}}`;
 const r=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q})});
 const row=(await r.json()).data.Media;
 clearBingeCatSearchCache();
 const mappings=await resolveAniListMappingsByBingeCatSearch([row]);
 console.log(JSON.stringify({row,mapping:mappings.get(212653)}));
});
