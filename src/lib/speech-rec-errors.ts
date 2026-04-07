/**
 * Turn SpeechRecognitionError `error` codes into kid/parent-friendly text.
 * @see https://wicg.github.io/speech-api/#speechrecognitionerror
 */
export function formatSpeechRecognitionError(code: string): string {
  const c = String(code || "").toLowerCase().trim();
  switch (c) {
    case "not-allowed":
    case "service-not-allowed":
      return (
        "Microphone or cloud speech isn’t allowed. " +
        "Allow the microphone for this site in your browser settings, use HTTPS (german.noteify.us), " +
        "and try Chrome or Edge. On iPhone, Safari’s speech feature is limited — try Chrome if it keeps failing."
      );
    case "audio-capture":
      return "No microphone was found, or it’s in use by another app.";
    case "network":
      return "Speech couldn’t reach the network. Check your connection and try again.";
    case "language-not-supported":
      return "German speech isn’t supported in this browser. Try Chrome or Edge.";
    case "no-speech":
      return "We didn’t hear speech. Move closer to the mic and try again.";
    case "aborted":
      return "Listening stopped.";
    default:
      return c ? `Speech: ${c}` : "Speech recognition had a problem.";
  }
}
