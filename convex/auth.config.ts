// Clerk issues the sign-in tokens that Convex verifies.
// Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard (or `npx convex env set`).
// It is the "Frontend API URL" from Clerk, for example https://your-app.clerk.accounts.dev
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
