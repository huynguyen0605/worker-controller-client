const fs = require("fs");
const { serverUrl } = JSON.parse(fs.readFileSync("config.json", "utf8"));
(async () => {
  const res = await fetch(`${serverUrl}/api/default-processes`);
})();
