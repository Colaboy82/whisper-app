// NextRequest: represents the incoming HTTP request (has the audio file attached)
// NextResponse: a helper to build the HTTP response we send back
import { NextRequest, NextResponse } from 'next/server';

// Import the official Groq SDK
import Groq from 'groq-sdk';

// Create one Groq client to reuse across all requests.
// The SDK automatically reads process.env.GROQ_API_KEY — you don't pass the key manually.
// process.env is a Node.js object containing all environment variables from .env.local.
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Exporting a function named POST tells Next.js:
// "When a POST request arrives at /api/transcribe, run this function."
// HTTP POST is the standard method for sending data (like a file) to a server.
export async function POST(req: NextRequest) {

  // FormData is the browser standard for sending files over HTTP.
  // When the frontend sends an audio file, it encodes it as "multipart/form-data".
  // req.formData() decodes that and gives us access to the file.
  const formData = await req.formData();

  // Extract the file from the form data using the key "audio".
  // This key must match what the frontend uses when it appends the file:
  // formData.append('audio', file)  ← frontend
  // formData.get('audio')           ← here
  // "as File" is a TypeScript type assertion — we're telling TypeScript
  // to treat this value as a File object (we know it will be one).
  const file = formData.get('audio') as File;

  // Guard clause: if no file came through, stop early and return an error.
  // HTTP status 400 means "Bad Request" — the client sent something invalid.
  if (!file) {
    return NextResponse.json(
      { error: 'No audio file provided' },
      { status: 400 }
    );
  }

  // Send the audio file to Groq's Whisper API for transcription.
  // Groq hosts the open-source Whisper model on their free infrastructure.
  // This call uploads the file to Groq's servers and waits for the transcript back.
  const transcription = await groq.audio.transcriptions.create({
    file,                          // The audio File object from the request
    model: 'whisper-large-v3-turbo',     // The Whisper model to use.
                                   // whisper-large-v3 is Groq's best free model —
                                   // it's actually more accurate than OpenAI's whisper-1.
    response_format: 'text',       // Return plain text instead of JSON with timestamps.
                                   // 'text' is simpler for our use case.
  });

  // Send the transcript back to the frontend as a JSON response.
  // NextResponse.json() converts the JS object to a JSON string and sets
  // the correct Content-Type: application/json header automatically.
  return NextResponse.json({ raw: transcription });
}