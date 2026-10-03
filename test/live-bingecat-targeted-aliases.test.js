import test from "node:test";
const Q=[
["155723","The God of War Dominates Season 2"],["155723","Martial Master Season 2"],
["199353","Spare Me, Great Lord! Season 3"],["199353","Spare My Life, King 3"],
["199409","A Will Eternal 4"],["199409","A Will Eternal 4th Season"],
["217624","PuchiCure 4"],["217624","PetitCure 4"],
["210687","Re:ZERO Starting Break Time From Zero Season 4"],["210687","Re:ZERO Break Time Season 4"],
["205289","Norman the Snowman 3"],["205289","Norman the Snowman: The Children's Star"],
["216625","Pokemon Sleep Season 2"],["216625","PokéOki Season 2"],
["215695","Stop-Motion Mofmof Parade"],["215695","Idolish7: Komadori Mofmof Parade"],
["214974","Tomb Guardian"],["214974","Daxia Guardian"],
["207217","Delivery Kitten"],["207217","Kitten Delivery"],
];
async function s(q,mode){const p=new URLSearchParams({query:q,mode,semantic_ratio:"0",exploration:"0",quality_bias:"0",newness_bias:"0",exclude_history:"0",page:"1",shuffle_session_seed:"nuvio-alias-2",include_reservoir:"1"});const r=await fetch(`https://bingecat.com/public/meilisearch/api?${p}`,{headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",Referer:"https://bingecat.com/"} });const x=await r.json();return [...(x.movies||[]),...(x.series||[])].slice(0,10).map(c=>({name:c.name,id:c.id,type:c.contentType,year:c.year,tmdb:c.tmdbId}));}
test("targeted BingeCat aliases",async()=>{for(const [id,q] of Q){console.log(JSON.stringify({id,q,exact:await s(q,"exact")}));}});
