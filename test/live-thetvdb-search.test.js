import test from "node:test";

const queries=[
 "A Good Day to Ascend",
 "A Will Eternal 4",
 "Dawang Raoming 3",
 "Wushen Zhuzai Da Wei Pian",
 "Da Xia Shou Mu Ren",
 "PokéOki",
 "Delivery Kitten Unyan",
 "Re:ZERO Starting Break Time From Zero Season 4",
 "Norman the Snowman Kodomo-tachi no Hitotsuboshi",
 "Komadori Mofmof Parade",
 "BanG Dream Ave Mujica Zoku-hen",
 "PetitCure Precure Fairies"
];

test("probe public TheTVDB search pages",async()=>{
 for(const query of queries){
  const url="https://www.thetvdb.com/search?query="+encodeURIComponent(query);
  const r=await fetch(url,{headers:{accept:"text/html,application/xhtml+xml"}});
  const html=await r.text();
  const ids=[...html.matchAll(/\/series\/(\d+)(?:["'/?#])/g)].map(m=>m[1]);
  console.log(JSON.stringify({query,status:r.status,ids:[...new Set(ids)].slice(0,10)}));
 }
});
