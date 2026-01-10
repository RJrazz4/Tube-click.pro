import JSZip from 'jszip';
import { getSavedContent, type SavedContent } from './stats';

export const downloadAsText = (content: string, filename: string): void => {
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
    throw error;
  }
};

export const exportAllAsZip = async (): Promise<void> => {
  const content = getSavedContent();
  
  if (content.length === 0) {
    throw new Error('No content to export');
  }

  const zip = new JSZip();
  
  // Create folders
  const scriptsFolder = zip.folder('scripts');
  const thumbnailsFolder = zip.folder('thumbnails');
  const guidesFolder = zip.folder('guides');
  const voiceoversFolder = zip.folder('voiceovers');

  for (const item of content) {
    const date = new Date(item.createdAt).toISOString().split('T')[0];
    const safeName = item.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    
    switch (item.type) {
      case 'script':
        scriptsFolder?.file(`${date}_${safeName}.txt`, item.content);
        break;
      case 'thumbnail':
        if (item.content.startsWith('data:')) {
          const base64Data = item.content.split(',')[1];
          thumbnailsFolder?.file(`${date}_${safeName}.png`, base64Data, { base64: true });
        }
        break;
      case 'guide':
        guidesFolder?.file(`${date}_${safeName}.md`, item.content);
        break;
      case 'voiceover':
        voiceoversFolder?.file(`${date}_${safeName}.txt`, item.content);
        break;
    }
  }

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
