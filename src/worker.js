export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle browser preflight CORS checks
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { title, iconUrl, type, content } = await request.json();

      if (!title || !iconUrl || !content) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Determine final game URL based on submission type
      let gameUrl = content;
      if (type === 'code') {
        // Encodes raw HTML code into a safe data URI
        gameUrl = `data:text/html;charset=utf-8,${encodeURIComponent(content)}`;
      }

      const repo = "hazzatazza/ubg-central";
      const filePath = "games.json";
      const githubToken = env.GITHUB_TOKEN;

      // 1. Fetch current games.json from GitHub
      const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "User-Agent": "Cloudflare-Worker"
        }
      });

      let games = [];
      let sha = null;

      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
        const decodedContent = atob(fileData.content);
        games = JSON.parse(decodedContent);
      }

      // 2. Add the new game to the list
      const newGame = {
        id: Date.now().toString(),
        title: title,
        thumb: iconUrl,
        url: gameUrl,
        type: type
      };

      games.push(newGame);

      // 3. Commit the updated games.json back to GitHub
      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Content-Type": "application/json",
          "User-Agent": "Cloudflare-Worker"
        },
        body: JSON.stringify({
          message: `Add game: ${title}`,
          content: btoa(JSON.stringify(games, null, 2)),
          sha: sha
        })
      });

      if (!putRes.ok) {
        const errJson = await putRes.json();
        throw new Error(errJson.message || "Failed to update GitHub repository");
      }

      return new Response(JSON.stringify({ success: true, game: newGame }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
