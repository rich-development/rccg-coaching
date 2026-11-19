// Clerk issues the sign-in tokens that Convex verifies.
// Set CLERK_FRONTEND_API_URL in the Convex dashboard (or `npx convex env set`).
// It is the "Frontend API URL" from Clerk, for example https://your-app.clerk.accounts.dev
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
