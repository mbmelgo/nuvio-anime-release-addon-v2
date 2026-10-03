import test from "node:test";

const queries=[
 [205289,"Norman the Snowman: Kodomo-tachi no Hitotsuboshi"],
 [215695,"Komadori Mofmof Parade"],
 [155723,"Wushen Zhuzai: Da Wei Pian"],
 [155723,"Wushen Zhuzai"],
 [214974,"Da Xia Shou Mu Ren"],
 [216625,"PokéOki SEASON 2"],
 [207217,"Delivery Kitten Unyan"],
 [210687,"Re:ZERO ~Starting Break Time From Zero~ Season 4"],
];

test("probe IMDb suggestion results for unresolved catalog entries",async()=>{
 for(const [id,q] of queries){
  const url="https://v3.sg.media-imdb.com/suggestion/x/"+encodeURIComponent(q)+".json";
  const r=await fetch(url,{headers:{accept:"application/json"}});
  const j=await r.json();
  console.log(JSON.stringify({
    id,q,status:r.status,
    results:(j.d||[]).slice(0,8).map(x=>({id:x.id,title:x.l,year:x.y,type:x.q,rank:x.rank}))
  }));
 }
});
