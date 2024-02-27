const fs = require("fs");
const { serverUrl } = JSON.parse(fs.readFileSync("config.json", "utf8"));

const wrap = (s) => "{ return " + s + " };";

(async () => {
  const res = await fetch(`${serverUrl}/api/default-process`);
  let allParams = {};
  const process = await res.json();
  for (const interaction of process.interactions) {
    try {
      console.log(":============>interaction", interaction);
      const executeInit = new Function(wrap(interaction.content));
      const params = JSON.parse(interaction.params);
      console.log(":============>execute function", interaction);
      if (params) {
        allParams = { ...allParams, ...params };
      }
      let result = await executeInit.call(null).call(null, allParams);
      if (result) {
        allParams = { ...allParams, ...result };
      }
      console.log(allParams);
    } catch (error) {
      console.log(":============>error", error.message);
    }
  }
})();
