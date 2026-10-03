import test from "node:test";

test("temporary BingeCat search investigation", async () => {
  for (const title of [
    "Girls und Panzer das Finale Part 5",
    "Norman the Snowman Kodomo-tachi no Hitotsuboshi",
    "Komadori Mofmof Parade",
    "Kidou Keisatsu Patlabor EZY File 3",
  ]) {
    const url = "https://bingecat.com/intellisearch?search=" + encodeURIComponent(title);
    const response = await fetch(url);
    const body = await response.text();
    console.log(JSON.stringify({
      title,
      status: response.status,
      finalUrl: response.url,
      snippet: body.slice(0, 3000),
    }));
  }
});
