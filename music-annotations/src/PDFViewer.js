import React, { useRef, useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabaseClient';

// Set worker path - use local file (most reliable)
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ''}/pdf.worker.min.mjs`;

export default function PDFViewer({ 
  pdfUrl, 
  annotations = [], 
  addAnnotation, 
  deleteAnnotation, 
  user, 
  profile, 
  currentPiece,
  isDeleteMode 
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pendingDeletes, setPendingDeletes] = useState([]);

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
    // Don't add annotations in delete mode
    if (isDeleteMode || !addAnnotation) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    addAnnotation({
      x,
      y,
      page: currentPage,
      type: 'dot',
      color: 'red'
    });
  }

  function handleAnnotationClick(annotation, e) {
    e.stopPropagation();
    
    // Only allow deletion in delete mode
    if (!isDeleteMode) return;
    
    const isMine = annotation.created_by === user?.id;
    const isTeacher = profile?.role === "teacher";
    
    // Check permissions
    if (!isTeacher && !isMine) {
      alert("You can only delete your own annotations.");
      return;
    }
    
    // Mark for deletion (toggle)
    if (pendingDeletes.find(a => a.id === annotation.id)) {
      setPendingDeletes(prev => prev.filter(a => a.id !== annotation.id));
    } else {
      setPendingDeletes(prev => [...prev, annotation]);
    }
  }

  function handleSaveChanges() {
    if (pendingDeletes.length === 0) {
      alert("No changes to save.");
      return;
    }
    
    // Delete all pending annotations
    pendingDeletes.forEach(ann => {
      if (deleteAnnotation) {
        deleteAnnotation(ann);
      }
    });
    
    setPendingDeletes([]);
    alert(`Deleted ${pendingDeletes.length} annotation(s)!`);
  }

  function handleCancelChanges() {
    setPendingDeletes([]);
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
      
      {/* Delete Mode Controls */}
      {isDeleteMode && pendingDeletes.length > 0 && (
        <div style={{
          marginBottom: 15,
          padding: 15,
          background: '#fff3cd',
          border: '2px solid #ffc107',
          borderRadius: 5,
          display: 'inline-block',
          textAlign: 'left'
        }}>
          <div style={{ marginBottom: 10, fontWeight: 'bold', fontSize: 16 }}>
            📋 Pending Deletions: {pendingDeletes.length}
          </div>
          <div style={{ marginBottom: 10, fontSize: 14, color: '#666' }}>
            Click annotations to select/deselect for deletion. Selected annotations are highlighted in red.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={handleSaveChanges}
              style={{
                padding: '10px 20px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 16
              }}
            >
              🗑️ Delete {pendingDeletes.length} Annotation{pendingDeletes.length !== 1 ? 's' : ''}
            </button>
            <button
              onClick={handleCancelChanges}
              style={{
                padding: '10px 20px',
                background: '#6c757d',
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
      
      {/* Delete Mode Instructions */}
      {isDeleteMode && pendingDeletes.length === 0 && (
        <div style={{
          marginBottom: 15,
          padding: 15,
          background: '#d1ecf1',
          border: '2px solid #0c5460',
          borderRadius: 5,
          display: 'inline-block',
          fontSize: 14,
          color: '#0c5460'
        }}>
          💡 <strong>Delete Mode Active:</strong> Click on annotations below to select them for deletion.
          {profile?.role !== 'teacher' && <span> (You can only delete your own annotations)</span>}
        </div>
      )}
      
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
          const isTeacher = profile?.role === "teacher";
          const canDelete = isTeacher || isMine;
          const isPendingDelete = pendingDeletes.find(a => 
            (a.id && ann.id && a.id === ann.id) || 
            (a.x === ann.x && a.y === ann.y && a.page === ann.page)
          );
          const borderColor = isMine ? 'rgba(0, 0, 255, 0.3)' : 'rgba(255, 165, 0, 0.3)';
          
          // Determine pointer events and cursor
          const pointerEvents = isDeleteMode ? 'auto' : 'none';
          const cursor = isDeleteMode ? (canDelete ? 'pointer' : 'not-allowed') : 'default';
          
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
              <div
                key={ann.id || i}
                onClick={(e) => handleAnnotationClick(ann, e)}
                style={{
                  position: 'absolute',
                  left: `${viewportX}px`,
                  top: `${viewportY}px`,
                  width: `${viewportWidth}px`,
                  height: `${viewportHeight}px`,
                  pointerEvents,
                  cursor,
                  zIndex: 10,
                  border: isPendingDelete ? '3px solid red' : (isDeleteMode && canDelete ? '2px solid yellow' : 'none'),
                  boxShadow: isPendingDelete ? '0 0 10px red' : 'none',
                  opacity: isPendingDelete ? 0.5 : 1
                }}
                title={isDeleteMode ? (canDelete ? 'Click to delete' : 'Cannot delete') : ''}
              >
                <img
                  src={src}
                  alt="annotation"
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                  }}
                  onError={() => console.error('Failed to load annotation image:', src)}
                />
              </div>
            );
          }
          
          // Dot annotation
          else if (ann.type === 'dot') {
            return (
              <div
                key={ann.id || i}
                onClick={(e) => handleAnnotationClick(ann, e)}
                style={{
                  position: 'absolute',
                  left: ann.x * scale - 10,
                  top: ann.y * scale - 10,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: ann.color || 'red',
                  border: isPendingDelete 
                    ? '4px solid red' 
                    : (isDeleteMode && canDelete 
                      ? '3px solid yellow' 
                      : `3px solid ${isMine ? 'blue' : 'orange'}`),
                  boxShadow: isPendingDelete 
                    ? '0 0 10px red' 
                    : '0 0 5px rgba(0,0,0,0.5)',
                  pointerEvents,
                  cursor,
                  opacity: isPendingDelete ? 0.5 : 1,
                  zIndex: 10,
                  transition: 'all 0.2s'
                }}
                title={isDeleteMode ? (canDelete ? 'Click to delete' : 'Cannot delete') : ''}
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