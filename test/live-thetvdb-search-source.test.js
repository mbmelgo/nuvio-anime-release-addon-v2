import test from "node:test";

const queries=[
 "A Good Day to Ascend",
 "A Will Eternal",
 "Wushen Zhuzai Da Wei Pian",
 "Re Zero kara Hajimeru Kyuukei Jikan Break Time 4th Season",
 "Da Xia Shou Mu Ren",
 "Delivery Kitten Unyan",
 "PokéOki Season 2",
 "BanG Dream Ave Mujica",
 "Norman the Snowman"
];

test("inspect public TheTVDB search HTML",async()=>{
 for(const query of queries){
  const r=await fetch("https://www.thetvdb.com/search?query="+encodeURIComponent(query),{headers:{accept:"text/html"}});
  const html=await r.text();
  const matches=[...html.matchAll(/href=["'](\/series\/[^"'?#]+)["'][^>]*>([^<]{1,200})</gi)]
    .slice(0,10).map(m=>({path:m[1],text:m[2].replace(/\s+/g," ").trim()}));
  console.log(JSON.stringify({query,status:r.status,bytes:html.length,matches}));
 }
});
