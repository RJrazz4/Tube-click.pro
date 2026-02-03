import JSZip from 'jszip';
import { getSavedContent, type SavedContent } from './stats';

export const downloadAsText = (content: string, filename: string): void => {
  if (!content || !content.trim()) {
    throw new Error('No content to download');
  }
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadAsImage = async (imageUrl: string, filename: string): Promise<void> => {
  if (!imageUrl) {
    throw new Error('No image URL provided');
  }
  
  try {
    // Handle both base64 and regular URLs
    if (imageUrl.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Failed to download image:', error);
    throw new Error('Failed to download image. Try right-click > Save Image.');
  }
};

/**
 * Validates that there is actual content to export
 */
const validateExportContent = (content: SavedContent[]): { valid: boolean; counts: Record<string, number> } => {
  const counts: Record<string, number> = {
    scripts: 0,
    thumbnails: 0,
    guides: 0,
    voiceovers: 0,
    storyboards: 0
  };
  
  for (const item of content) {
    if (!item.content || !item.content.trim()) continue;
    
    switch (item.type) {
      case 'script':
        counts.scripts++;
        break;
      case 'thumbnail':
        // Only count thumbnails with actual image data
        if (item.content.startsWith('data:') || item.content.startsWith('http')) {
          counts.thumbnails++;
        }
        break;
      case 'guide':
        counts.guides++;
        break;
      case 'voiceover':
        counts.voiceovers++;
        break;
      case 'storyboard':
        counts.storyboards++;
        break;
    }
  }
  
  const totalValid = Object.values(counts).reduce((a, b) => a + b, 0);
  return { valid: totalValid > 0, counts };
};

export const exportAllAsZip = async (): Promise<void> => {
  const content = getSavedContent();
  
  if (content.length === 0) {
    throw new Error('No content saved yet. Create some content first!');
  }

  // Validate content
  const { valid, counts } = validateExportContent(content);
  if (!valid) {
    throw new Error('No valid content to export. All saved items appear to be empty.');
  }

  const zip = new JSZip();
  
  // Create folders
  const scriptsFolder = zip.folder('scripts');
  const thumbnailsFolder = zip.folder('thumbnails');
  const guidesFolder = zip.folder('guides');
  const voiceoversFolder = zip.folder('voiceovers');

  let filesAdded = 0;
  const errors: string[] = [];

  for (const item of content) {
    if (!item.content || !item.content.trim()) continue;
    
    const date = new Date(item.createdAt).toISOString().split('T')[0];
    const safeName = item.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30) || 'untitled';
    
    try {
      switch (item.type) {
        case 'script':
          scriptsFolder?.file(`${date}_${safeName}.txt`, item.content);
          filesAdded++;
          break;
          
        case 'thumbnail':
          if (item.content.startsWith('data:')) {
            try {
              const base64Data = item.content.split(',')[1];
              if (base64Data) {
                thumbnailsFolder?.file(`${date}_${safeName}.png`, base64Data, { base64: true });
                filesAdded++;
              }
            } catch (e) {
              errors.push(`Thumbnail ${safeName}: Invalid image data`);
            }
          } else if (item.content.startsWith('http')) {
            // For URL-based thumbnails, save the URL reference
            thumbnailsFolder?.file(`${date}_${safeName}_url.txt`, 
              `Thumbnail URL: ${item.content}\n\nNote: Download this image directly from the URL above.`
            );
            filesAdded++;
          }
          break;
          
        case 'guide':
          guidesFolder?.file(`${date}_${safeName}.md`, item.content);
          filesAdded++;
          break;
          
        case 'voiceover':
          // NOTE: Browser limitation - only the text transcript is saved.
          // Actual audio files must be downloaded directly from VoiceStudio.
          voiceoversFolder?.file(`${date}_${safeName}_transcript.txt`, 
            `VOICEOVER TRANSCRIPT\n` +
            `==================\n\n` +
            `${item.content}\n\n` +
            `---\n` +
            `Note: Audio files cannot be included in ZIP exports due to browser limitations.\n` +
            `To download the MP3 file, use the Download button in Voiceover Studio with ElevenLabs enabled.`
          );
          filesAdded++;
          break;
          
        case 'storyboard':
          // Storyboard descriptions are saved; images must be downloaded via Storyboard page
          guidesFolder?.file(`${date}_${safeName}_storyboard.txt`, 
            `STORYBOARD DESCRIPTION\n` +
            `=====================\n\n` +
            `${item.content}\n\n` +
            `---\n` +
            `Note: Storyboard images must be downloaded separately using the\n` +
            `"Download Storyboard ZIP" button on the Storyboard page.`
          );
          filesAdded++;
          break;
      }
    } catch (e) {
      errors.push(`${item.type} ${safeName}: Export failed`);
    }
  }

  if (filesAdded === 0) {
    throw new Error('Failed to add any files to the ZIP. Please try again.');
  }

  // Add a manifest file
  const manifest = `TubeGenius Pro Export
=====================
Export Date: ${new Date().toISOString()}

Contents:
- Scripts: ${counts.scripts}
- Thumbnails: ${counts.thumbnails}
- Guides: ${counts.guides}
- Voiceover Transcripts: ${counts.voiceovers}
- Storyboard Descriptions: ${counts.storyboards}

Total Files: ${filesAdded}

${errors.length > 0 ? `\nWarnings:\n${errors.join('\n')}` : ''}

Notes:
------
- Audio files (MP3) must be downloaded directly from Voiceover Studio
- Storyboard images must be downloaded using the Storyboard page's ZIP button
- Some thumbnails may be saved as URL references if they couldn't be embedded
`;
  zip.file('_MANIFEST.txt', manifest);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tubegenius-export-${new Date().toISOString().split('T')[0]}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
