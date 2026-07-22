/**
 * Script Cleaner Utility
 * Removes all non-voiceover content from generated scripts:
 * - Timestamps [00:00], [0:00-0:15], etc.
 * - B-Roll markers [B-ROLL], [B-ROLL: description]
 * - Transition markers [TRANSITION], [CUT TO], [FADE IN/OUT]
 * - Camera directions [CLOSE-UP], [WIDE SHOT], [PAN], etc.
 * - Sound effects [SFX], [MUSIC], [SOUND]
 * - Stage directions in brackets
 */

// Patterns to remove from scripts
const CLEANUP_PATTERNS: RegExp[] = [
  // Timestamps: [00:00], [0:00-0:15], [00:15 - 00:30], (00:00), etc.
  /\[?\(?\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?\)?\]?/gi,
  
  // B-Roll markers
  /\[B-ROLL[^\]]*\]/gi,
  /\(B-ROLL[^\)]*\)/gi,
  /B-ROLL:/gi,
  
  // Transition markers
  /\[(TRANSITION|CUT TO|CUT|FADE IN|FADE OUT|FADE|DISSOLVE|WIPE)[^\]]*\]/gi,
  /\((TRANSITION|CUT TO|CUT|FADE IN|FADE OUT|FADE|DISSOLVE|WIPE)[^\)]*\)/gi,
  
  // Camera directions
  /\[(CLOSE-?UP|CLOSEUP|WIDE SHOT|MEDIUM SHOT|PAN|ZOOM|TRACKING|ESTABLISHING)[^\]]*\]/gi,
  /\((CLOSE-?UP|CLOSEUP|WIDE SHOT|MEDIUM SHOT|PAN|ZOOM|TRACKING|ESTABLISHING)[^\)]*\)/gi,
  
  // Sound/Music markers
  /\[(SFX|SOUND|MUSIC|AUDIO)[^\]]*\]/gi,
  /\((SFX|SOUND|MUSIC|AUDIO)[^\)]*\)/gi,
  
  // Visual instructions
  /\[(VISUAL|SHOW|DISPLAY|INSERT|OVERLAY|TEXT ON SCREEN|LOWER THIRD)[^\]]*\]/gi,
  /\((VISUAL|SHOW|DISPLAY|INSERT|OVERLAY|TEXT ON SCREEN|LOWER THIRD)[^\)]*\)/gi,
  
  // Intro/Outro markers
  /\[(INTRO|OUTRO|HOOK|OPENING|CLOSING)[^\]]*\]/gi,
  /\((INTRO|OUTRO|HOOK|OPENING|CLOSING)[^\)]*\)/gi,
  
  // Generic bracketed instructions with common keywords
  /\[(?:ON SCREEN|SHOT OF|CUT TO|SCENE)[^\]]*\]/gi,
  
  // Asterisk formatting
  /\*\*[^\*]+\*\*/g, // Bold markdown
  /\*[^\*]+\*/g, // Italic markdown
];

// Lines to completely remove (empty or only whitespace after cleanup)
const LINE_REMOVAL_PATTERNS: RegExp[] = [
  // Lines that are ONLY timestamps or markers
  /^[\[\(\s]*\d{1,2}:\d{2}.*$/gim,
  // Lines that start with dashes followed by timestamps
  /^[-–—]\s*\d{1,2}:\d{2}/gim,
];

/**
 * Clean a script by removing all production markers and leaving only voiceover text
 */
export function cleanScript(script: string): string {
  if (!script || typeof script !== 'string') {
    return '';
  }

  let cleaned = script;

  // Apply all cleanup patterns
  for (const pattern of CLEANUP_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Split into lines for line-level processing
  const lines = cleaned.split('\n');
  
  const cleanedLines = lines
    .map(line => {
      // Remove leading/trailing whitespace
      const cleanLine = line.trim();
      
      // Remove lines that are now empty or only contain punctuation/dashes
      if (/^[-–—:.\s]*$/.test(cleanLine)) {
        return '';
      }
      
      // Remove section headers that are standalone
      if (/^(SCENE|ACT|PART|SECTION)\s*\d*:?\s*$/i.test(cleanLine)) {
        return '';
      }
      
      // Remove timestamp-only lines
      if (/^\[?\(?\d{1,2}:\d{2}/.test(cleanLine)) {
        return '';
      }
      
      return cleanLine;
    })
    .filter(line => line.length > 0);

  // Rejoin and clean up multiple blank lines
  cleaned = cleanedLines.join('\n');
  
  // Remove multiple consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Final trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Extract pure voiceover text suitable for TTS
 */
export function extractVoiceoverText(script: string): string {
  const cleaned = cleanScript(script);
  
  // Further simplify for TTS - remove any remaining special characters
  const voiceover = cleaned
    // Remove any remaining brackets with content
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^\)]*\)/g, '')
    // Remove markdown formatting
    .replace(/[#*_~`]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  return voiceover;
}

/**
 * Check if a script has been cleaned (no production markers)
 */
export function isCleanScript(script: string): boolean {
  const hasMarkers = CLEANUP_PATTERNS.some(pattern => pattern.test(script));
  return !hasMarkers;
}
