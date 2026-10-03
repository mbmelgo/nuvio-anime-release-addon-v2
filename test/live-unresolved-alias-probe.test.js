import test from "node:test";

const IDS=[205289,189121,212653,215695,155723,199353,214260,217624,210687,214974,216625,207217];

async function anilist(ids){
 const q=`query($ids:[Int!]!){Page(perPage:50){media(id_in:$ids,type:ANIME){id format startDate{year} title{english romaji native} synonyms}}}`;
 const r=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:q,variables:{ids}})});
 return (await r.json()).data.Page.media;
}
function variants(row){
 const titles=[row.title.english,row.title.romaji,row.title.native,...(row.synonyms||[])].filter(Boolean);
 const out=new Set(titles);
 for(const t of titles){
  const v=t
   .replace(/\s*\/?\s*\(?(?:Zoku-hen|続編|Sequel)\)?$/i,"")
   .replace(/\s*[-–—:]?\s*(?:Season|4th|3rd|2nd|2|3|4|5)\s*(?:Season)?$/i,"")
   .replace(/\s*\(?\s*(?:4th|3rd|2nd|2|3|4|5)\s*Season\s*\)?$/i,"")
   .trim();
  if(v!==t) out.add(v);
 }
 return [...out];
}
async function search(q){
 const p=new URLSearchParams({query:q,mode:"exact",semantic_ratio:"0",exploration:"0",quality_bias:"0",newness_bias:"0",exclude_history:"0",page:"1",shuffle_session_seed:"nuvio-alias-investigation",include_reservoir:"1"});
 const r=await fetch("https://bingecat.com/public/meilisearch/api?"+p,{headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",Referer:"https://bingecat.com/"}});
 const j=await r.json();
 return [...(j.movies||[]),...(j.series||[])].slice(0,6).map(x=>({name:x.name,id:x.id,type:x.contentType,year:x.year,tmdb:x.tmdbId}));
}
test("probe unresolved AniList title/base-title variants",async()=>{
 for(const row of await anilist(IDS)){
  for(const q of variants(row)){
   const hits=await search(q);
   if(hits.length) console.log(JSON.stringify({id:row.id,year:row.startDate?.year,format:row.format,query:q,hits}));
  }
 }
});
