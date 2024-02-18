const fs = require("fs");
const { serverUrl } = JSON.parse(fs.readFileSync("config.json", "utf8"));

const wrap = (s) => "{ return " + s + " };";

(async () => {
  const res = await fetch(`${serverUrl}/api/default-process`);
  const process = await res.json();
  for (const interaction of process.interactions) {
    const executeInit = new Function(wrap(interaction.content));
    const params = JSON.parse(interaction.params);
    await executeInit.call(null).call(null, params);
  }
})();
