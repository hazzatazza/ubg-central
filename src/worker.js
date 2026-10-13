export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    try {
      const { title, iconUrl, type, content } = await request.json();
      if (!title || !content || !iconUrl) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
      }

      const owner = "YOUR_GITHUB_USERNAME";
      const repo = "YOUR_REPO_NAME";
      const token = env.GITHUB_TOKEN; // Automatically pulled from Cloudflare Secrets

      // 1. Fetch current games.json from GitHub
      const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/games.json`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "UBG-Central-Worker",
          "Accept": "application/vnd.github+json"
        }
      });

      let currentData = [];
      let sha = null;
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
        currentData = JSON.parse(atob(fileData.content));
      }

      const gameId = title.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now();
      let gameUrl = content;

      // 2. If submitted as raw code, create a separate HTML file for it
      if (type === "code") {
        const codePath = `games/${gameId}.html`;
        const encodedCode = btoa(unescape(encodeURIComponent(content)));
        
        await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${codePath}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": "UBG-Central-Worker",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `Add game code file: ${title}`,
            content: encodedCode,
            branch: "main"
          })
        });
        gameUrl = `/${codePath}`;
      }

      // 3. Append the new game to the JSON array
      currentData.push({
        id: gameId,
        title: title,
        thumb: iconUrl,
        url: gameUrl,
        type: "game"
      });

      // 4. Commit updated games.json back to GitHub
      const updateRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/games.json`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "UBG-Central-Worker",
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Update games.json with new game: ${title}`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(currentData, null, 2)))),
          sha: sha,
          branch: "main"
        })
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error("GitHub API Error: " + errText);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }
};
