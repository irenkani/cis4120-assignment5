import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabaseClient';

// Set worker path - use local file (most reliable)
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ''}/pdf.worker.min.mjs`;

export default function AnnotationDetector({ basePdfUrl, onDetectionComplete, onClose, currentPiece, user }) {
  const [uploading, setUploading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [progress, setProgress] = useState('');
  const [detectedRegions, setDetectedRegions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState(new Set());

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setDetecting(true);
    setProgress('Reading PDF...');

    try {
      const uploadedPdfUrl = await fileToDataUrl(file);
      
      setProgress('Detecting annotation regions...');
      const regions = await extractAnnotationRegions(basePdfUrl, uploadedPdfUrl);
      
      if (regions.length === 0) {
        alert('No new annotations detected. Make sure you annotated with a different color.');
        setDetecting(false);
        setUploading(false);
        return;
      }
      
      setDetectedRegions(regions);
      // Select all regions by default
      setSelectedRegions(new Set(regions.map((_, i) => i)));
      setShowPreview(true);
      setDetecting(false);
      
    } catch (error) {
      console.error('Detection error:', error);
      alert('Error detecting annotations: ' + error.message);
      setUploading(false);
      setDetecting(false);
    }
  }

  async function handleConfirmUpload() {
    const selected = detectedRegions.filter((_, i) => selectedRegions.has(i));
    
    if (selected.length === 0) {
      alert('Please select at least one annotation to upload.');
      return;
    }
    
    setProgress(`Uploading ${selected.length} annotation(s)...`);
    setDetecting(true);
    setUploading(true);
    
    try {
      const annotations = await uploadAnnotationRegions(selected);
      
      if (annotations.length === 0) {
        alert('No annotations were successfully uploaded. Please check the console for errors.');
        setUploading(false);
        setDetecting(false);
        return;
      }
      
      setUploading(false);
      setDetecting(false);
      
      alert(`Successfully uploaded ${annotations.length} annotation(s)!`);
      onDetectionComplete(annotations);
      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading annotations: ' + error.message);
      setUploading(false);
      setDetecting(false);
    }
  }

  function toggleRegionSelection(index) {
    const newSelected = new Set(selectedRegions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRegions(newSelected);
  }

  function selectAll() {
    setSelectedRegions(new Set(detectedRegions.map((_, i) => i)));
  }

  function deselectAll() {
    setSelectedRegions(new Set());
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function extractAnnotationRegions(basePdfUrl, uploadedPdfUrl) {
    const baseDoc = await pdfjsLib.getDocument(basePdfUrl).promise;
    const uploadedDoc = await pdfjsLib.getDocument(uploadedPdfUrl).promise;
    
    const allRegions = [];
    const numPages = Math.min(baseDoc.numPages, uploadedDoc.numPages);

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      setProgress(`Processing page ${pageNum} of ${numPages}...`);
      const pageRegions = await extractFromPage(baseDoc, uploadedDoc, pageNum);
      allRegions.push(...pageRegions);
    }

    return allRegions;
  }

  async function extractFromPage(baseDoc, uploadedDoc, pageNum) {
    const scale = 2.0;
    
    const basePage = await baseDoc.getPage(pageNum);
    const uploadedPage = await uploadedDoc.getPage(pageNum);
    
    const viewport = basePage.getViewport({ scale });
    
    // Create canvases
    const baseCanvas = document.createElement('canvas');
    const uploadedCanvas = document.createElement('canvas');
    
    baseCanvas.width = uploadedCanvas.width = viewport.width;
    baseCanvas.height = uploadedCanvas.height = viewport.height;
    
    const baseCtx = baseCanvas.getContext('2d');
    const uploadedCtx = uploadedCanvas.getContext('2d');
    
    // Render both PDFs
    await basePage.render({ canvasContext: baseCtx, viewport }).promise;
    await uploadedPage.render({ canvasContext: uploadedCtx, viewport }).promise;
    
    // Get pixel difference map
    const diffMap = createDifferenceMap(baseCtx, uploadedCtx, viewport.width, viewport.height);
    
    // Find connected regions (groups of nearby different pixels)
    const boundingBoxes = findConnectedRegions(diffMap, viewport.width, viewport.height);
    
    // Extract each region as a separate transparent PNG
    const regions = [];
    for (let i = 0; i < boundingBoxes.length; i++) {
      const bbox = boundingBoxes[i];
      const regionBlob = await extractRegionAsTransparentPNG(
        uploadedCanvas, 
        baseCanvas, 
        bbox
      );
      
      // Skip regions with no visible content
      if (!regionBlob) {
        console.warn(`Skipping region ${i + 1} - no visible content`);
        continue;
      }
      
      regions.push({
        page: pageNum,
        x: bbox.x / scale,
        y: bbox.y / scale,
        width: bbox.width / scale,
        height: bbox.height / scale,
        imageBlob: regionBlob,
        previewUrl: URL.createObjectURL(regionBlob),
        scale: scale
      });
    }
    
    return regions;
  }

  function createDifferenceMap(baseCtx, uploadedCtx, width, height) {
    const baseData = baseCtx.getImageData(0, 0, width, height);
    const uploadedData = uploadedCtx.getImageData(0, 0, width, height);
    
    const diffMap = new Uint8Array(width * height);
    const threshold = 30;
    
    for (let i = 0; i < baseData.data.length; i += 4) {
      const rDiff = Math.abs(baseData.data[i] - uploadedData.data[i]);
      const gDiff = Math.abs(baseData.data[i + 1] - uploadedData.data[i + 1]);
      const bDiff = Math.abs(baseData.data[i + 2] - uploadedData.data[i + 2]);
      
      if (rDiff + gDiff + bDiff > threshold) {
        diffMap[i / 4] = 1;
      }
    }
    
    return diffMap;
  }

  function findConnectedRegions(diffMap, width, height) {
    const visited = new Set();
    const regions = [];
    const minSize = 50; // Minimum pixels to be considered an annotation
    const padding = 10; // Padding around each region
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        if (diffMap[idx] === 1 && !visited.has(idx)) {
          const bbox = floodFillBoundingBox(diffMap, width, height, x, y, visited);
          
          // Only keep regions with enough pixels
          if (bbox.pixelCount > minSize) {
            // Add padding
            regions.push({
              x: Math.max(0, bbox.minX - padding),
              y: Math.max(0, bbox.minY - padding),
              width: Math.min(width, bbox.maxX + padding) - Math.max(0, bbox.minX - padding),
              height: Math.min(height, bbox.maxY + padding) - Math.max(0, bbox.minY - padding),
              pixelCount: bbox.pixelCount
            });
          }
        }
      }
    }
    
    return regions;
  }

  function floodFillBoundingBox(diffMap, width, height, startX, startY, visited) {
    const stack = [[startX, startY]];
    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;
    let pixelCount = 0;
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * width + x;
      
      if (visited.has(idx) || x < 0 || x >= width || y < 0 || y >= height) {
        continue;
      }
      
      if (diffMap[idx] !== 1) continue;
      
      visited.add(idx);
      pixelCount++;
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      
      // Check 8 neighbors (including diagonals for better grouping)
      stack.push(
        [x + 1, y], [x - 1, y], 
        [x, y + 1], [x, y - 1],
        [x + 1, y + 1], [x - 1, y - 1],
        [x + 1, y - 1], [x - 1, y + 1]
      );
    }
    
    return { minX, maxX, minY, maxY, pixelCount };
  }

  async function extractRegionAsTransparentPNG(uploadedCanvas, baseCanvas, bbox) {
    // Create canvas for this region
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = bbox.width;
    regionCanvas.height = bbox.height;
    const ctx = regionCanvas.getContext('2d');
    
    // Get the uploaded and base image data for this region
    const uploadedCtx = uploadedCanvas.getContext('2d');
    const baseCtx = baseCanvas.getContext('2d');
    
    const uploadedData = uploadedCtx.getImageData(bbox.x, bbox.y, bbox.width, bbox.height);
    const baseData = baseCtx.getImageData(bbox.x, bbox.y, bbox.width, bbox.height);
    
    // Create transparent version
    const transparentData = ctx.createImageData(bbox.width, bbox.height);
    const threshold = 30;
    
    for (let i = 0; i < uploadedData.data.length; i += 4) {
      const rDiff = Math.abs(baseData.data[i] - uploadedData.data[i]);
      const gDiff = Math.abs(baseData.data[i + 1] - uploadedData.data[i + 1]);
      const bDiff = Math.abs(baseData.data[i + 2] - uploadedData.data[i + 2]);
      
      if (rDiff + gDiff + bDiff > threshold) {
        // Different pixel - keep from uploaded version
        transparentData.data[i] = uploadedData.data[i];
        transparentData.data[i + 1] = uploadedData.data[i + 1];
        transparentData.data[i + 2] = uploadedData.data[i + 2];
        transparentData.data[i + 3] = 255; // Opaque
      } else {
        // Same pixel - make transparent
        transparentData.data[i] = 0;
        transparentData.data[i + 1] = 0;
        transparentData.data[i + 2] = 0;
        transparentData.data[i + 3] = 0; // Transparent
      }
    }
    
    ctx.putImageData(transparentData, 0, 0);
    
    // Validate that the image has at least some visible pixels
    let visiblePixels = 0;
    for (let i = 3; i < transparentData.data.length; i += 4) {
      if (transparentData.data[i] > 0) { // Alpha > 0 means visible
        visiblePixels++;
      }
    }
    
    if (visiblePixels === 0) {
      console.warn('Extracted region has no visible pixels, skipping:', bbox);
      return null;
    }
    
    console.log(`Extracted region with ${visiblePixels} visible pixels (${Math.round(visiblePixels / (bbox.width * bbox.height) * 100)}% coverage)`);
    
    return new Promise((resolve) => {
      regionCanvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to create blob from canvas');
          resolve(null);
        } else {
          console.log(`Created PNG blob: ${(blob.size / 1024).toFixed(2)} KB`);
          resolve(blob);
        }
      }, 'image/png');
    });
  }

  async function uploadAnnotationRegions(regions) {
    if (!currentPiece || !user) {
      console.error('Missing currentPiece or user:', { currentPiece, user });
      alert('Error: Missing piece or user information. Please try again.');
      return [];
    }

    if (!regions || regions.length === 0) {
      console.error('No regions to upload');
      return [];
    }

    const uploadedAnnotations = [];
    const timestamp = Date.now();
    
    console.log(`Starting upload of ${regions.length} annotation(s)...`);
    console.log('Upload context:', {
      pieceId: currentPiece.id,
      userId: user.id,
      regionsCount: regions.length
    });
    
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      
      if (!region.imageBlob) {
        console.error(`Region ${i + 1} is missing imageBlob:`, region);
        continue;
      }
      
      try {
        const fileName = `annotations/${currentPiece.id}/${user.id}-p${region.page}-${timestamp}-${i}.png`;
        
        console.log(`Uploading annotation ${i + 1}/${regions.length}: ${fileName}`);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('stickers')
          .upload(fileName, region.imageBlob, {
            contentType: 'image/png',
            upsert: true // Use upsert to avoid conflicts
          });
        
        if (uploadError) {
          console.error(`Upload error for annotation ${i + 1}:`, {
            error: uploadError,
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            fileName: fileName
          });
          
          // Try with a unique filename if the error persists
          const retryFileName = `annotations/${currentPiece.id}/${user.id}-p${region.page}-${timestamp}-${i}-${Math.random().toString(36).substring(7)}.png`;
          console.log(`Retrying with filename: ${retryFileName}`);
          
          const { data: retryData, error: retryError } = await supabase.storage
            .from('stickers')
            .upload(retryFileName, region.imageBlob, {
              contentType: 'image/png',
              upsert: true
            });
          
          if (retryError) {
            console.error(`Retry upload also failed for annotation ${i + 1}:`, retryError);
            continue;
          }
          
          // NO getPublicUrl here
          
          uploadedAnnotations.push({
            x: region.x,
            y: region.y,
            page: region.page,
            type: 'sticker',
            sticker_url: retryFileName,   // <-- PATH, not URL
            width: region.width,
            height: region.height,
            color: null,
            auto_detected: true
          });
          
          console.log(`Successfully uploaded annotation ${i + 1} (retry)`);
          continue;
        }
        
        console.log(`Successfully uploaded annotation ${i + 1}/${regions.length}`);
        
        uploadedAnnotations.push({
          x: region.x,
          y: region.y,
          page: region.page,
          type: 'sticker',
          sticker_url: fileName,       // <-- PATH, not URL
          width: region.width,
          height: region.height,
          color: null,
          auto_detected: true
        });
      } catch (error) {
        console.error(`Error processing annotation ${i + 1}:`, error);
        continue;
      }
    }
    
    console.log(`Upload complete: ${uploadedAnnotations.length} of ${regions.length} annotations uploaded successfully`);
    
    if (uploadedAnnotations.length === 0) {
      console.error('No annotations were uploaded. Check the errors above.');
    }
    
    return uploadedAnnotations;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: 'white',
        padding: 30,
        borderRadius: 10,
        maxWidth: 700,
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2>🔍 Upload Annotated PDF</h2>
        
        {!detecting && !showPreview && (
          <div>
            <p>Upload your annotated PDF. The system will extract each annotation as a separate transparent image.</p>
            
            <div style={{ 
              background: '#e8f5e9', 
              padding: 15, 
              borderRadius: 5,
              marginBottom: 20,
              border: '2px solid #4caf50'
            }}>
              <strong style={{ color: '#4caf50' }}>✓ How it works:</strong>
              <ol style={{ marginTop: 10, marginBottom: 0, paddingLeft: 20, textAlign: 'left' }}>
                <li>Detects groups of changed pixels (your annotations)</li>
                <li>Extracts each group as a separate transparent PNG</li>
                <li>Preserves exact position and appearance</li>
                <li>Each annotation can be managed individually</li>
              </ol>
            </div>
            
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{
                display: 'block',
                margin: '20px 0',
                padding: 10,
                border: '2px dashed #007bff',
                borderRadius: 5,
                width: '100%',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            />
          </div>
        )}
        
        {detecting && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🔄</div>
            <p style={{ fontSize: 18, fontWeight: 'bold' }}>{progress}</p>
          </div>
        )}
        
        {showPreview && !detecting && (
          <div>
            <div style={{ 
              background: '#e8f5e9', 
              padding: 15, 
              borderRadius: 5,
              marginBottom: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <strong style={{ color: '#4caf50', fontSize: 18 }}>
                ✓ Found {detectedRegions.length} annotation(s)! Select which ones to upload:
              </strong>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={selectAll}
                  style={{
                    padding: '5px 10px',
                    background: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  style={{
                    padding: '5px 10px',
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>
            
            <div style={{ 
              maxHeight: 400, 
              overflow: 'auto',
              border: '1px solid #ddd',
              borderRadius: 5,
              padding: 10,
              marginBottom: 20
            }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 10
              }}>
                {detectedRegions.map((region, i) => {
                  const isSelected = selectedRegions.has(i);
                  return (
                    <div 
                      key={i} 
                      onClick={() => toggleRegionSelection(i)}
                      style={{
                        border: `3px solid ${isSelected ? '#4caf50' : '#ddd'}`,
                        borderRadius: 5,
                        padding: 5,
                        textAlign: 'center',
                        background: isSelected ? '#e8f5e9' : '#f9f9f9',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: isSelected ? '#4caf50' : 'white',
                        border: '2px solid #4caf50',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        color: 'white',
                        fontWeight: 'bold'
                      }}>
                        {isSelected ? '✓' : ''}
                      </div>
                      <img 
                        src={region.previewUrl} 
                        alt={`Annotation ${i + 1}`}
                        style={{
                          width: '100%',
                          height: 'auto',
                          maxHeight: 100,
                          objectFit: 'contain',
                          background: 'repeating-conic-gradient(#ddd 0% 25%, transparent 0% 50%) 50% / 10px 10px',
                          pointerEvents: 'none'
                        }}
                      />
                      <div style={{ fontSize: 12, marginTop: 5 }}>
                        Page {region.page}
                      </div>
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        {Math.round(region.width)} × {Math.round(region.height)}px
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div style={{
              background: '#fff3cd',
              padding: 10,
              borderRadius: 5,
              marginBottom: 20,
              fontSize: 14
            }}>
              <strong>Selected: {selectedRegions.size} of {detectedRegions.length}</strong>
              {selectedRegions.size === 0 && (
                <span style={{ color: '#dc3545', marginLeft: 10 }}>
                  ⚠️ Please select at least one annotation to upload
                </span>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleConfirmUpload}
                disabled={selectedRegions.size === 0}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: selectedRegions.size === 0 ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: 5,
                  cursor: selectedRegions.size === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: 16
                }}
              >
                ✓ Upload {selectedRegions.size} Selected Annotation{selectedRegions.size !== 1 ? 's' : ''}
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 16
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {!detecting && !showPreview && (
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 5,
              cursor: uploading ? 'not-allowed' : 'pointer',
              width: '100%'
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}