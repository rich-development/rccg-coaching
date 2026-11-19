import { clerkMiddleware } from "@clerk/nextjs/server";

// Sign-in state for every page. Data access is enforced in Convex, where each
// function checks who is asking before it reads or writes anything.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
