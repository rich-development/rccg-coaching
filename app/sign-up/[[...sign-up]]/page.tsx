import { SignUp } from "@clerk/nextjs";

// Invitation emails land here so a new client or team member can set up her sign-in.
export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <SignUp fallbackRedirectUrl="/" signInFallbackRedirectUrl="/" />
    </main>
  );
}
