import test from "node:test";

const CASES = [[205289,["Norman the Snowman: Kodomo-tachi no Hitotsuboshi","ノーマン・ザ・スノーマン ~こどもたちのひとつ星~"],2026],[189121,["BanG Dream! It's MyGO!!!!! / Ave Mujica (Zoku-hen)","BanG Dream! It's MyGO!!!!! / Ave Mujica (続編)"],2027],[212653,["Kidou Keisatsu Patlabor EZY File 3","機動警察パトレイバー EZY File 3"],2027],[215695,["Komadori Mofmof Parade","こまどり モフモフパレード"],2027],[155723,["Wushen Zhuzai: Da Wei Pian","武神主宰 大威篇"],2022],[199353,["Dawang Raoming 3","大王饶命 第三季"],2026],[214260,["A Good Day to Ascend","Zeri Feisheng","择日飞升"],2026],[217624,["PetitCure: Precure Fairies Season 4","ぷちきゅあ～Precure Fairies～ シーズン4"],2026],[210687,["Re:Zero kara Hajimeru Kyuukei Jikan (Break Time) 4th Season","Re:ゼロから始める休憩時間(ブレイクタイム) 4th Season"],2026],[199409,["Yi Nian Yongheng 4","Yi Nian Yong Heng: Wanjie Ji","A Will Eternal Final Season","一念永恒 完结季"],2026],[214974,["Da Xia Shou Mu Ren","大夏守墓人"],2026],[216625,["PokéOki SEASON 2","ポケ起き SEASON 2"],2026],[207217,["Delivery Kitten Unyan","Koneko no Haitatsuin Uunyan","子猫の配達員うーにゃん"],2026]];
function norm(v) { return String(v || "").normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase().replace(/[^\\p{Letter}\\p{Number}]+/gu, " ").trim().replace(/\\s+/g, " "); }
function similarity(a,b){const A=new Set(norm(a).split(" ").filter(Boolean)),B=new Set(norm(b).split(" ").filter(Boolean)); if(!A.size||!B.size)return 0; return [...A].filter(x=>B.has(x)).length/Math.max(A.size,B.size);}

test("temporary BingeCat AI title coverage investigation", async () => {
  for (const [anilistId,titles,year] of CASES) {
    const all=[];
    for(const title of titles){
      const qs=new URLSearchParams({query:title,mode:"ai",semantic_ratio:"0.55",exploration:"0.78",quality_bias:"0.6",newness_bias:"0.4",exclude_history:"0",page:"1",shuffle_session_seed:"nuvio-addon-investigation",include_reservoir:"1"});
      const response=await fetch("https://bingecat.com/public/meilisearch/api?"+qs,{headers:{"X-Requested-With":"XMLHttpRequest",Accept:"application/json",Referer:"https://bingecat.com/"}});
      const data=await response.json();
      for(const item of [...(data.movies||[]),...(data.series||[])].slice(0,10)){
        all.push({query:title,name:item.name,id:item.id,tmdbId:item.tmdbId,year:item.year,sim:similarity(title,item.name)});
      }
    }
    all.sort((a,b)=>b.sim-(a.sim||0));
    console.log(JSON.stringify({anilistId,top:all.slice(0,5)}));
  }
});
