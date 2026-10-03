import test from "node:test";

const IDS = [205289,189121,212653,215695,199353,214260,217624,210687,214974,155723,216625,207217];

const norm=(v)=>String(v||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu," ").trim().replace(/\s+/g," ");

async function ani(ids){
 const q=`query($ids:[Int!]!){Page(perPage:50){media(id_in:$ids,type:ANIME){id format startDate{year} title{english romaji native} synonyms}}}`;
 const r=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,variables:{ids}})});
 return (await r.json()).data.Page.media;
}
async function search(title){
 const p=new URLSearchParams({query:title,exploration:"0.55",quality_bias:"0.6",newness_bias:"0.4",exclude_history:"0",page:"1",shuffle_session_seed:"nuvio-anime-addon-default-investigation",include_reservoir:"1"});
 const r=await fetch(`https://bingecat.com/public/meilisearch/api?${p}`,{headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",Referer:"https://bingecat.com/"}}); const x=await r.json();
 return {status:r.status,hits:[...(x.movies||[]),...(x.series||[])].map(c=>({name:c.name,id:c.id,type:c.contentType,year:c.year,tmdb:c.tmdbId}))};
}
test("investigate BingeCat default search for unresolved IDs",async()=>{
 for(const row of await ani(IDS)){
  const titles=[row.title.english,row.title.romaji,row.title.native,...(row.synonyms||[])].filter(Boolean);
  for(const title of [...new Map(titles.map(t=>[norm(t),t])).values()]){
   const x=await search(title);
   const exact=x.hits.filter(h=>titles.some(t=>norm(t)===norm(h.name)));
   console.log(JSON.stringify({id:row.id,year:row.startDate?.year||null,format:row.format,title,exact,top:x.hits.slice(0,5)}));
  }
 }
});
