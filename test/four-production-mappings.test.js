import test from "node:test";
import { resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";

const rows = [
 {id:217282,format:"TV_SHORT",startDate:{year:2026},title:{english:null,romaji:"GelPiyo 2",native:"ゲルぴよ 2"},synonyms:[]},
 {id:216625,format:"ONA",startDate:{year:2026},title:{english:"PokéOki SEASON 2",romaji:"PokéOki SEASON 2",native:"ポケ起き SEASON 2"},synonyms:[]},
 {id:235,format:"TV",startDate:{year:1996},title:{english:"Detective Conan",romaji:"Meitantei Conan",native:"名探偵コナン"},synonyms:["Case Closed"]},
 {id:191832,format:"ONA",startDate:{year:2026},title:{english:"Link Click Season 3",romaji:"Shiguang Dailiren III",native:"时光代理人 第三季"},synonyms:[]},
];
test("current main IMDb resolver investigation",async()=>{
 const r=await resolveAniListMappingsByImdbSearch(rows);
 for(const x of rows) console.log(JSON.stringify({id:x.id,title:x.title,result:r.get(x.id)||null}));
});
