// app/page.tsx

// 'use client' tells Next.js this component runs in the browser (client-side).
// By default, Next.js 14 runs components on the server. We need client-side
// because we use React hooks (useState, useRef) and browser events (onClick, onDrop).
'use client';

// useState: stores values that change over time and triggers re-renders when they do
// useRef: holds a reference to a DOM element without causing re-renders
import { useState, useRef } from 'react';

// TypeScript type definitions — these describe the shape of our data.
// If we try to access a field that doesn't exist, TypeScript warns us at compile time.

// The shape of the notes object that Gemini returns
type Notes = {
  title: string;
  summary: string;
  keyPoints: string[];  
  actionItems: string[];
};

// All possible loading states for the app.
// Using a union type (with |) means TypeScript will warn us if we
// accidentally set status to something invalid like 'loading'.
type Status = 'idle' | 'transcribing' | 'processing' | 'done' | 'error';

// The four output tabs the user can switch between
type Tab = 'cleaned' | 'summary' | 'keyPoints' | 'actionItems';

// Default export = the main component for this page.
// Next.js renders this when someone visits the root URL ("/").
export default function Home() {

  // --- State declarations ---
  // useState<Type>(initialValue) returns [currentValue, setterFunction].
  // Calling the setter updates the value and re-renders the component.

  const [status, setStatus] = useState<Status>('idle');
  const [raw, setRaw] = useState('');            // Raw transcript from Groq Whisper
  const [cleaned, setCleaned] = useState('');    // Cleaned transcript from Gemini
  const [notes, setNotes] = useState<Notes | null>(null); // Notes object from Gemini
  const [activeTab, setActiveTab] = useState<Tab>('cleaned'); // Which tab is showing
  const [errorMsg, setErrorMsg] = useState('');  // Error message to display

  // useRef holds a reference to the hidden <input type="file"> element.
  // We need this so we can programmatically trigger the file picker
  // when the user clicks the upload area (instead of the input itself).
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Main processing function ---
  // Called when the user selects or drops a file.
  // async means it can use await to pause for API responses.
  async function handleFile(file: File) {

    // Validate the file type before sending to the API.
    // Groq Whisper supports: mp3, mp4, mpeg, mpga, m4a, wav, webm.
    // file.type returns the MIME type (e.g. "audio/mpeg" for mp3).
    // file.name.endsWith('.m4a') is a fallback because some browsers
    // report m4a files with an empty or incorrect MIME type.
    const validTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/m4a'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.m4a')) {
      setErrorMsg('Please upload an audio file: mp3, m4a, wav, or webm.');
      setStatus('error');
      return; // Stop execution here — don't proceed to the API calls
    }

    // Reset state from any previous run and show loading
    setStatus('transcribing');
    setErrorMsg('');
    setRaw('');
    setCleaned('');
    setNotes(null);

    // --- Step 1: Transcribe with Groq Whisper ---

    // FormData is the browser API for sending files via fetch.
    // We create a new FormData object and attach the audio file to it
    // under the key 'audio' (must match formData.get('audio') in route.ts).
    const formData = new FormData();
    formData.append('audio', file);

    // fetch() sends an HTTP request. We await the response.
    // Important: do NOT set a Content-Type header when sending FormData.
    // The browser sets it automatically with the correct multipart boundary string.
    // If you set it manually, you'll break the file upload.
    const transcribeRes = await fetch('/api/transcribe', {
      method: 'POST',  // POST because we're sending data, not just requesting it
      body: formData,
    });

    // .ok is true if the HTTP status is 200-299 (success range)
    if (!transcribeRes.ok) {
      setStatus('error');
      setErrorMsg('Transcription failed. Check your Groq API key and try again.');
      return;
    }

    // .json() parses the JSON response body into a JavaScript object.
    // We destructure { raw: rawTranscript } to rename raw → rawTranscript
    // so it doesn't conflict with our state variable named 'raw'.
    const { raw: rawTranscript } = await transcribeRes.json();

    // Update state with the raw transcript so it shows up in the UI immediately
    setRaw(rawTranscript);
    setStatus('processing');

    // --- Steps 2 & 3: Clean transcript AND generate notes in parallel ---

    // Promise.all() takes an array of promises and runs them simultaneously.
    // Without it, we'd wait for /api/clean to finish before starting /api/notes.
    // With it, both API calls start at the same time — roughly halving the wait.
    // Promise.all() itself returns a promise that resolves when ALL of them finish.
    const [cleanRes, notesRes] = await Promise.all([

      // Call /api/clean to remove filler words
      fetch('/api/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // Tell the server we're sending JSON
        body: JSON.stringify({ transcript: rawTranscript }), // Convert JS object → JSON string
      }),

      // Call /api/notes to generate summary, key points, action items
      fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: rawTranscript }),
      }),

    ]);

    // Parse both responses. Each .json() call is also async, but since
    // we're doing them sequentially here (not parallel), we just await each.
    const { cleaned: cleanedTranscript } = await cleanRes.json();
    const notesData: Notes = await notesRes.json();

    // Update state with all results — React will re-render the UI
    setCleaned(cleanedTranscript);
    setNotes(notesData);
    setStatus('done');
  }

  // Helper function: returns a human-readable description of the current state
  function statusLabel(): string {
    if (status === 'transcribing') return '🎙️ Transcribing audio with Whisper...';
    if (status === 'processing')   return '✨ Cleaning transcript and generating notes...';
    if (status === 'error')        return errorMsg;
    return '';
  }

  // --- Render ---
  // JSX looks like HTML but it's actually JavaScript.
  // className is used instead of class (class is a reserved JS keyword).
  // Curly braces {} inside JSX let you embed JavaScript expressions.
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">
          Voice Memo Cleaner
        </h1>
        <p className="text-gray-500 mb-8">
          Upload a voice memo to get a cleaned transcript, summary, and auto-generated notes.
        </p>

        {/* Upload / drop zone */}
        {/* We intercept drag-and-drop events and the click to control exactly
            what happens instead of relying on default browser behavior. */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center
                     cursor-pointer hover:border-blue-400 transition-colors mb-6"
          onClick={() => fileInputRef.current?.click()}
          // onDragOver: fires repeatedly as a file is dragged over the element.
          // e.preventDefault() stops the browser from trying to open the file.
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault(); // Again, stop default behavior (browser opening the file)
            const file = e.dataTransfer.files[0]; // files[0] = first dropped file
            if (file) handleFile(file);
          }}
        >
          {/* The actual file input is hidden visually but still functional.
              We trigger it programmatically via the ref when the div above is clicked. */}
          <input
            ref={fileInputRef}           // Connect this element to our ref
            type="file"
            accept=".mp3,.m4a,.wav,.webm,audio/*" // Limit file browser to audio files
            className="hidden"           // Visually hidden (but not removed from DOM)
            onChange={(e) => {
              // e.target.files is a FileList — we grab the first file with [0].
              // The ?. is optional chaining: if files is null, don't crash, just return undefined.
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="text-4xl mb-3">🎙️</div>
          <p className="text-gray-600 text-lg font-medium">Drop your audio file here</p>
          <p className="text-gray-400 text-sm mt-1">or click to browse — mp3, m4a, wav, webm</p>
        </div>

        {/* Status message — only shown when not idle or done */}
        {/* In JSX, {condition && <element>} renders the element only when condition is true */}
        {(status === 'transcribing' || status === 'processing' || status === 'error') && (
          <p className={`text-sm mb-6 ${status === 'error' ? 'text-red-500' : 'text-blue-500'}`}>
            {statusLabel()}
          </p>
        )}

        {/* Results section — only shown after everything is done */}
        {status === 'done' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

            {/* Tab navigation bar */}
            <div className="flex border-b border-gray-200">
              {/* We map over an array of tab IDs to render each tab button.
                  This is cleaner than writing four identical button elements by hand. */}
              {(['cleaned', 'summary', 'keyPoints', 'actionItems'] as Tab[]).map((tab) => (
                <button
                  key={tab}              // React needs a unique key when rendering lists
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium transition-colors flex-1
                    ${activeTab === tab
                      ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {/* Map tab IDs to human-readable labels using an inline object lookup */}
                  {{ cleaned: 'Cleaned', summary: 'Summary', keyPoints: 'Key Points', actionItems: 'Action Items' }[tab]}
                </button>
              ))}
            </div>

            {/* Tab content area */}
            <div className="p-6">

              {/* Cleaned transcript tab */}
              {activeTab === 'cleaned' && (
                <div>
                  {/* whitespace-pre-wrap preserves line breaks from the transcript */}
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {cleaned}
                  </p>
                  {/* navigator.clipboard.writeText() copies text to the system clipboard */}
                  <button
                    onClick={() => navigator.clipboard.writeText(cleaned)}
                    className="mt-4 text-sm text-blue-500 hover:underline"
                  >
                    Copy to clipboard
                  </button>
                </div>
              )}

              {/* Summary tab */}
              {activeTab === 'summary' && notes && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">
                    {notes.title}
                  </h2>
                  <p className="text-gray-700 leading-relaxed">{notes.summary}</p>
                </div>
              )}

              {/* Key points tab */}
              {activeTab === 'keyPoints' && notes && (
                <ul className="space-y-3">
                  {/* .map() transforms each item in the array into a <li> element */}
                  {notes.keyPoints.map((point, i) => (
                    // i is the array index — used as key since the list order is stable
                    <li key={i} className="flex gap-3 text-gray-700">
                      <span className="text-blue-500 font-bold mt-0.5">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Action items tab — rendered as interactive checkboxes */}
              {activeTab === 'actionItems' && notes && (
                <div>
                  {notes.actionItems.length === 0 ? (
                    // Ternary operator: condition ? showIfTrue : showIfFalse
                    <p className="text-gray-400 text-sm italic">No action items identified.</p>
                  ) : (
                    <ul className="space-y-3">
                      {notes.actionItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          {/* A real working checkbox — state is managed by the browser.
                              Checking/unchecking doesn't need any React state because
                              we don't need to save it anywhere. */}
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-500"
                          />
                          <span className="text-gray-700">{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

            </div>

            {/* Collapsible raw transcript at the bottom */}
            {/* <details> and <summary> are native HTML — clicking summary toggles details open/closed */}
            <details className="border-t border-gray-100 px-6 py-4">
              <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                View raw transcript (with filler words)
              </summary>
              <p className="mt-3 text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">
                {raw}
              </p>
            </details>

          </div>
        )}

      </div>
    </main>
  );
}