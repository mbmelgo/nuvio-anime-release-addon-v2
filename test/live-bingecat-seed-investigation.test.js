import test from "node:test";
test("investigate BingeCat seed sensitivity for Patlabor EZY File 3", async()=>{
 for(const seed of ["nuvio-anime-addon","nuvio-alias-2","patlabor",""]){
  const p=new URLSearchParams({query:"Patlabor EZY File 3",mode:"exact",semantic_ratio:"0",exploration:"0",quality_bias:"0",newness_bias:"0",exclude_history:"0",page:"1",include_reservoir:"1"});
  if(seed) p.set("shuffle_session_seed",seed);
  const r=await fetch(`https://bingecat.com/public/meilisearch/api?${p}`,{headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",Referer:"https://bingecat.com/"}}); const x=await r.json();
  console.log(JSON.stringify({seed,status:r.status,hits:[...(x.movies||[]),...(x.series||[])].slice(0,20).map(c=>({name:c.name,id:c.id,type:c.contentType,year:c.year,tmdb:c.tmdbId}))}));
 }
});
