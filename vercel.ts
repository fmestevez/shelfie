import { routes, type VercelConfig } from "@vercel/config/v1";

// Production domain: shelfie.theboardgamesfamily.com (attached to the project; see README → Deploying).
export const config: VercelConfig = {
  framework: "nextjs",
  headers: [
    routes.header("/(.*)", [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]),
  ],
};
