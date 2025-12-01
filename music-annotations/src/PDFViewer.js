import React, { useRef, useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabaseClient';

// Set worker path - use local file (most reliable)
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ''}/pdf.worker.min.mjs`;

export default function PDFViewer({ pdfUrl, annotations = [], onAnnotationAdd, user }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (pdfUrl) {
      // Cancel any ongoing render when PDF URL changes
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      // Reset state
      setPdfDoc(null);
      setCurrentPage(1);
      setNumPages(0);
      setLoading(true);
      loadPDF(pdfUrl);
    }
    
    // Cleanup on unmount
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, scale]);

  // Debug logging for annotations
  useEffect(() => {
    if (annotations.length > 0) {
      const pageAnnotations = annotations.filter(a => {
        const annPage = typeof a.page === 'string' ? parseInt(a.page) : (a.page || 1);
        return annPage === currentPage;
      });
      console.log('PDFViewer annotations:', {
        total: annotations.length,
        currentPage,
        pageAnnotations: pageAnnotations.length,
        annotations: annotations.map(a => ({ id: a.id, page: a.page, type: a.type, piece_id: a.piece_id }))
      });
    }
  }, [annotations, currentPage]);

  async function loadPDF(url) {
    setLoading(true);
    try {
      const loadingTask = pdfjsLib.getDocument(url);
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Failed to load PDF: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any ongoing render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const page = await pdfDoc.getPage(pageNum);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');

    const viewport = page.getViewport({ scale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    setCanvasSize({ width: viewport.width, height: viewport.height });

    // Store the render task so we can cancel it if needed
    const renderTask = page.render({
      canvasContext: context,
      viewport: viewport
    });
    renderTaskRef.current = renderTask;

    try {
      await renderTask.promise;
    } catch (error) {
      // Ignore cancellation errors
      if (error.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', error);
      }
    } finally {
      renderTaskRef.current = null;
    }
  }

  function handleCanvasClick(e) {
    if (!onAnnotationAdd) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    onAnnotationAdd({
      x,
      y,
      page: currentPage,
      type: 'dot',
      color: 'red'
    });
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <div style={{ fontSize: 48 }}>📄</div>
        <p>Loading PDF...</p>
      </div>
    );
  }

  // Filter annotations for current page, handling both numeric and string page values
  const pageAnnotations = annotations.filter(a => {
    const annPage = typeof a.page === 'string' ? parseInt(a.page) : (a.page || 1);
    return annPage === currentPage;
  });

  return (
    <div style={{ textAlign: 'center' }}>
      {/* Controls */}
      <div style={{ 
        marginBottom: 15, 
        padding: 10, 
        background: '#f0f0f0', 
        borderRadius: 5,
        display: 'inline-block'
      }}>
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          style={{
            padding: '8px 15px',
            marginRight: 10,
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            background: currentPage <= 1 ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 5
          }}
        >
          ← Previous
        </button>
        <span style={{ margin: '0 15px', fontWeight: 'bold' }}>
          Page {currentPage} of {numPages}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
          disabled={currentPage >= numPages}
          style={{
            padding: '8px 15px',
            marginLeft: 10,
            cursor: currentPage >= numPages ? 'not-allowed' : 'pointer',
            background: currentPage >= numPages ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 5
          }}
        >
          Next →
        </button>
        
        <span style={{ marginLeft: 30 }}>Zoom:</span>
        <button
          onClick={() => setScale(Math.max(0.5, scale - 0.25))}
          style={{ 
            marginLeft: 10, 
            padding: '8px 15px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer'
          }}
        >
          -
        </button>
        <span style={{ margin: '0 10px', fontWeight: 'bold' }}>{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale(Math.min(3, scale + 0.25))}
          style={{ 
            padding: '8px 15px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer'
          }}
        >
          +
        </button>
      </div>
      
      {/* PDF Canvas with Annotation Layers */}
      <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
        {/* Base PDF */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            border: '2px solid #333',
            cursor: 'crosshair',
            maxWidth: '100%',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            display: 'block'
          }}
        />
        
        {/* Annotation Layers Overlay */}
        {pageAnnotations.map((ann, i) => {
          const isMine = ann.created_by === user?.id;
          const borderColor = isMine ? 'rgba(0, 0, 255, 0.3)' : 'rgba(255, 165, 0, 0.3)';
          
          // Individual sticker/image annotation (includes auto-detected regions)
          if (ann.type === 'sticker' && ann.sticker_url) {
            // Convert storage path to public URL
            const { data } = supabase.storage
              .from('stickers')
              .getPublicUrl(ann.sticker_url);  // this is the path we stored
            
            const src = data.publicUrl;
            
            // Convert PDF coordinates to viewport coordinates
            // PDF coordinates are in points (72 DPI), viewport is at current scale
            const viewportX = ann.x * scale;
            const viewportY = ann.y * scale;
            const viewportWidth = ann.width ? ann.width * scale : 50;
            const viewportHeight = ann.height ? ann.height * scale : 50;
            
            return (
              <img
                key={ann.id || i}
                src={src}
                alt="annotation"
                style={{
                  position: 'absolute',
                  left: `${viewportX}px`,
                  top: `${viewportY}px`,
                  width: `${viewportWidth}px`,
                  height: `${viewportHeight}px`,
                  pointerEvents: 'none',
                  zIndex: 10
                }}
                onError={() => console.error('Failed to load annotation image:', src)}
              />
            );
          }
          
          // Dot annotation
          else if (ann.type === 'dot') {
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: ann.x * scale - 7,
                  top: ann.y * scale - 7,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: ann.color || 'red',
                  border: `3px solid ${isMine ? 'blue' : 'orange'}`,
                  boxShadow: '0 0 5px rgba(0,0,0,0.5)',
                  pointerEvents: 'none'
                }}
              />
            );
          }
          
          return null;
        })}
      </div>
      
      {/* Legend */}
      <div style={{ 
        marginTop: 15, 
        padding: 10,
        background: '#f0f8ff',
        borderRadius: 5,
        display: 'inline-block'
      }}>
        <strong>Annotations on this page:</strong>
        <div style={{ marginTop: 5, fontSize: 14 }}>
          {pageAnnotations.length > 0 ? (
            <>
              <div style={{ color: 'blue' }}>
                🔵 {pageAnnotations.filter(a => a.created_by === user?.id).length} yours
              </div>
              <div style={{ color: 'orange' }}>
                🟠 {pageAnnotations.filter(a => a.created_by !== user?.id).length} from others
              </div>
              {pageAnnotations.filter(a => a.auto_detected).length > 0 && (
                <div style={{ color: '#666', marginTop: 5, fontSize: 12 }}>
                  ✨ {pageAnnotations.filter(a => a.auto_detected).length} auto-detected
                </div>
              )}
            </>
          ) : (
            <span style={{ color: '#666', fontStyle: 'italic' }}>
              No annotations on this page yet
            </span>
          )}
        </div>
      </div>
    </div>
  );
}