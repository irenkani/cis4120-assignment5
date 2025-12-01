import { PDFDocument, rgb } from 'pdf-lib';
import { supabase } from './supabaseClient';

export async function downloadPDFWithAnnotations(basePdfUrl, annotations, fileName = 'annotated-score.pdf') {
  try {
    // Fetch the base PDF
    const existingPdfBytes = await fetch(basePdfUrl).then(res => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    const pages = pdfDoc.getPages();
    
    // Group annotations by page
    const annotationsByPage = {};
    annotations.forEach(ann => {
      const pageNum = typeof ann.page === 'string' ? parseInt(ann.page) : (ann.page || 1);
      if (!annotationsByPage[pageNum]) {
        annotationsByPage[pageNum] = [];
      }
      annotationsByPage[pageNum].push(ann);
    });
    
    // Draw annotations on each page
    for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
      const page = pages[pageNum - 1];
      const { width, height } = page.getSize();
      
      const pageAnnotations = annotationsByPage[pageNum] || [];
      
      for (const ann of pageAnnotations) {
        // Convert annotation coordinates (top-left origin) to PDF coordinates (bottom-left origin)
        const pdfY = height - ann.y;
        
        if (ann.type === 'sticker' && ann.sticker_url) {
          // Handle PNG/sticker annotations
          try {
            // Convert storage path to public URL
            const { data: urlData } = supabase.storage
              .from('stickers')
              .getPublicUrl(ann.sticker_url);  // this is the path we stored
            
            const imageUrl = urlData.publicUrl;
            
            // Fetch the PNG image
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
              console.warn(`Failed to fetch annotation image: ${imageUrl}`);
              continue;
            }
            
            const imageBytes = await imageResponse.arrayBuffer();
            let image;
            
            // Try to embed as PNG
            try {
              image = await pdfDoc.embedPng(imageBytes);
            } catch (pngError) {
              // If PNG embedding fails, try JPEG
              try {
                image = await pdfDoc.embedJpg(imageBytes);
              } catch (jpgError) {
                console.warn(`Failed to embed image for annotation: ${imageUrl}`, jpgError);
                continue;
              }
            }
            
            // Draw the image at the annotation position
            // Note: PDF coordinates use bottom-left origin, so we need to adjust Y
            const imageWidth = ann.width || image.width;
            const imageHeight = ann.height || image.height;
            
            page.drawImage(image, {
              x: ann.x,
              y: pdfY - imageHeight, // Adjust for bottom-left origin
              width: imageWidth,
              height: imageHeight,
              opacity: 1
            });
            
            console.log(`Embedded annotation image on page ${pageNum}:`, imageUrl);
          } catch (error) {
            console.error(`Error embedding annotation image: ${ann.sticker_url}`, error);
            // Continue with other annotations
          }
        } else {
          // Handle dot/circle annotations
          const color = getColorFromString(ann.color);
          
          if (ann.type === 'dot') {
            // Draw filled circle
            page.drawCircle({
              x: ann.x,
              y: pdfY,
              size: 5,
              color: color,
              opacity: 0.8
            });
          } else if (ann.type === 'circle') {
            // Draw hollow circle
            page.drawCircle({
              x: ann.x,
              y: pdfY,
              size: ann.radius || 20,
              borderColor: color,
              borderWidth: 2,
              opacity: 0.6
            });
          }
        }
      }
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Error creating PDF:', error);
    throw error;
  }
}

function getColorFromString(colorStr) {
  const colors = {
    'red': rgb(1, 0, 0),
    'blue': rgb(0, 0, 1),
    'green': rgb(0, 1, 0),
    'yellow': rgb(1, 1, 0),
    'purple': rgb(0.5, 0, 0.5),
    'orange': rgb(1, 0.5, 0),
    'black': rgb(0, 0, 0)
  };
  
  return colors[colorStr] || rgb(1, 0, 0);
}
