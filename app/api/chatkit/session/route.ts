import { NextResponse } from "next/server";

export async function POST() {
  const publicKey = process.env.CHATKIT_PUBLIC_KEY;

  if (!publicKey) {
    console.error("CHATKIT_PUBLIC_KEY is not set in environment variables");
    return NextResponse.json(
      { error: "ChatKit configuration missing. Please set CHATKIT_PUBLIC_KEY in your environment variables." },
      { status: 500 }
    );
  }

  try {
    // Return the session configuration that ChatKit expects
    // The public key authorizes the client to connect to OpenAI's ChatKit service
    return NextResponse.json({
      public_key: publicKey,
    });
  } catch (error) {
    console.error("Error creating ChatKit session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

// Also support GET for easier testing
export async function GET() {
  return POST();
}

