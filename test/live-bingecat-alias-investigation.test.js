import test from "node:test";

const QUERIES = [
  ["202390","Girls und Panzer das Finale: Part 5"],
  ["205289","Norman the Snowman"],
  ["189121","BanG Dream! Ave Mujica"],
  ["189121","Ave Mujica"],
  ["196613","Fights Break Sphere 4"],
  ["196613","Battle Through the Heavens 8"],
  ["199353","Spare Me, Great Lord! 3"],
  ["199353","Dawang Raoming 3"],
  ["199409","A Will Eternal 4"],
  ["199409","A Will Eternal 4th Season"],
  ["214260","A Good Day to Ascend"],
  ["214974","The Guardian of Daxia"],
  ["215695","Komadori Mofmof Parade"],
  ["215695","Komadori"],
  ["216625","PokéOki"],
  ["216625","PokeOki"],
  ["217624","PetitCure Precure Fairies Season 4"],
  ["210687","Re:ZERO Break Time 4th Season"],
  ["210687","Re:ZERO -Starting Life in Another World- Break Time"],
  ["212653","Patlabor EZY File 3"],
];

async function search(query) {
  const params = new URLSearchParams({
    query,
    mode:"exact",
    semantic_ratio:"0",
    exploration:"0.2",
    quality_bias:"0",
    newness_bias:"0",
    exclude_history:"0",
    page:"1",
    shuffle_session_seed:"nuvio-anime-addon-alias-investigation",
    include_reservoir:"1",
  });
  const r=await fetch(`https://bingecat.com/public/meilisearch/api?${params}`,{
    headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",Referer:"https://bingecat.com/"}
  });
  const p=await r.json();
  return {status:r.status,hits:[...(p.movies||[]),...(p.series||[])].slice(0,8).map(x=>({name:x.name,id:x.id,type:x.contentType,year:x.year,tmdb:x.tmdbId}))};
}

test("investigate likely English aliases in BingeCat", async () => {
  for (const [id,query] of QUERIES) {
    console.log(JSON.stringify({id,query,result:await search(query)}));
  }
});
