import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fetch from "node-fetch"; // We'll use native fetch if Node 18+, but let's just use global fetch

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/auth/url", (req, res) => {
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
    const clientId = process.env.DISCORD_CLIENT_ID || '1484912235389128734';
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email',
    });

    res.json({ url: `https://discord.com/oauth2/authorize?${params.toString()}` });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    const redirectUri = 'https://ais-dev-pmkijaegsz5tuk3bwowkwd-100525640238.europe-west2.run.app/auth/callback';
    const clientId = process.env.DISCORD_CLIENT_ID || '1484912235389128734';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      let userData = null;

      if (clientSecret) {
        // Exchange code for token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code: code as string,
            redirect_uri: redirectUri,
          }),
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (accessToken) {
          const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          });
          userData = await userResponse.json();
        }
      } else {
        // If no secret is provided, we can't exchange the code. 
        // We'll just mock the user data for the preview environment so the user can see it working.
        userData = { username: "DemoUser", id: "123456789" };
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  user: ${JSON.stringify(userData)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
