import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import PDFViewer from "./PDFViewer";
import AnnotationDetector from "./AnnotationDetector";
import { downloadPDFWithAnnotations } from "./PDFDownloader";
import Login from "./Login";
import VersionHistory from "./VersionHistory";
import ConflictResolver from "./ConflictResolver";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [currentPiece, setCurrentPiece] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetector, setShowDetector] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const [pendingAnnotations, setPendingAnnotations] = useState([]);
  const [pendingDeletions, setPendingDeletions] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentPiece, setCurrentPiece] = useState("symphony-1");
  const [pieces, setPieces] = useState([
    { id: "symphony-1", name: "Symphony No. 1" },
    { id: "symphony-2", name: "Symphony No. 2" },
    { id: "canon-in-d", name: "Canon in D" },
  ]);

  useEffect(() => {
    checkUser();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadPieces();
    }
  }, [user]);

  useEffect(() => {
    if (user && currentPiece) {
      loadAnnotations();
    }
  }, [currentPiece, user]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setUser(data.session.user);
      loadProfile(data.session.user.id);
    }
  }

  async function loadPieces() {
    const { data, error } = await supabase
      .from("pieces")
      .select("*")
      .order("name", { ascending: true });
    
    if (error) {
      console.error("Error loading pieces:", error);
    } else {
      setPieces(data || []);
      // Set default piece if none selected
      if (!currentPiece && data && data.length > 0) {
        setCurrentPiece(data[0]);
      }
    }
  }

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    
    if (data) {
      setProfile(data);
    } else if (error) {
      // Profile doesn't exist, create it
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const newProfile = {
          user_id: userId,
          email: user.email,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          role: user.user_metadata?.role || 'student',
        };
        
        const { data: created, error: insertError } = await supabase
          .from("profiles")
          .insert(newProfile)
          .select()
          .single();
        
        if (created) {
          setProfile(created);
        } else {
          console.error("Failed to create profile:", insertError);
        }
      }
    }
  }

  async function loadAnnotations() {
    const { data, error } = await supabase.from("annotations").select("*");
    if (error) console.error(error);
    else {
      setAnnotations(data || []);
      // Initialize history with current state when loading
      setHistory([{ annotations: data || [], deletions: [] }]);
      setHistoryIndex(0);
      setPendingDeletions([]);
    }
  }

  const saveToHistory = (newAnnotations, newDeletions) => {
    // Clear any future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      annotations: newAnnotations,
      deletions: newDeletions,
    });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const addAnnotation = (a) => {
    const newAnnotation = { ...a, created_by: user.id, version: 1 };
    const newAnnotations = [...annotations, newAnnotation];
    
    setAnnotations(newAnnotations);
    saveToHistory(newAnnotations, pendingDeletions);
    setSaved(false);
  };

  const deleteAnnotation = (annotation) => {
    // Permission check: students can only delete their own, teachers can delete any
    const isMine = annotation.created_by === user.id;
    const isTeacher = profile?.role === "teacher";
    
    if (!isTeacher && !isMine) {
      alert("You can only delete your own annotations.");
      return;
    }
    
    // If annotation has an id, it's saved in database - mark for deletion
    if (annotation.id) {
      setPendingDeletions((prev) => [...prev, annotation]);
      // Visually remove from annotations list
      setAnnotations((prev) => prev.filter((a) => a.id !== annotation.id));
      saveToHistory(
        annotations.filter((a) => a.id !== annotation.id),
        [...pendingDeletions, annotation]
      );
    } else {
      // If no id, it's a local unsaved annotation - just remove from state
      const newAnnotations = annotations.filter((a) => a !== annotation);
      setAnnotations(newAnnotations);
      saveToHistory(newAnnotations, pendingDeletions);
    }
    setSaved(false);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAnnotations(prevState.annotations);
      setPendingDeletions(prevState.deletions);
      setHistoryIndex(historyIndex - 1);
      setSaved(false);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAnnotations(nextState.annotations);
      setPendingDeletions(nextState.deletions);
      setHistoryIndex(historyIndex + 1);
      setSaved(false);
    }
  };

  function detectConflicts(newAnnotations, existingAnnotations) {
    const OVERLAP_THRESHOLD = 30;
    const foundConflicts = [];

    newAnnotations.forEach((newA) => {
      existingAnnotations.forEach((existing) => {
        if (existing.piece_id !== newA.piece_id || existing.page !== newA.page) return;
        
        const distance = Math.sqrt(
          Math.pow(newA.x - existing.x, 2) + Math.pow(newA.y - existing.y, 2)
        );
        if (distance < OVERLAP_THRESHOLD) {
          foundConflicts.push({
            newAnnotation: newA,
            existing: existing,
          });
        }
      });
    });

    return foundConflicts;
  }

  async function saveAnnotations() {
    const newOnes = annotations.filter((a) => !a.id);
    const toDelete = pendingDeletions;
    
    if (newOnes.length === 0 && toDelete.length === 0) {
      return alert("No changes to save!");
    }

    // Check for conflicts with new annotations
    const existingOnes = annotations.filter((a) => a.id);
    const foundConflicts = detectConflicts(newOnes, existingOnes);

    if (foundConflicts.length > 0) {
      const conflictsWithCreators = await Promise.all(
        foundConflicts.map(async (conflict) => {
          const { data: creator } = await supabase
            .from("profiles")
            .select("name, role")
            .eq("user_id", conflict.existing.created_by)
            .single();
          return { ...conflict, existingCreator: creator };
        })
      );
      setConflicts(conflictsWithCreators);
      setPendingAnnotations(newOnes);
      setShowConflicts(true);
      return;
    }

    // Process deletions first
    if (toDelete.length > 0) {
      const deletePromises = toDelete.map((annotation) =>
        supabase.from("annotations").delete().eq("id", annotation.id)
      );
      const deleteResults = await Promise.all(deletePromises);
      const deleteErrors = deleteResults.filter((r) => r.error);
      if (deleteErrors.length > 0) {
        console.error("Delete errors:", deleteErrors);
        alert("Some deletions failed. Check console.");
        return;
      }
    }

    // Then insert new annotations
    if (newOnes.length > 0) {
      const { error } = await supabase.from("annotations").insert(newOnes);
      if (error) {
        console.error(error);
        alert("Error saving annotations: " + error.message);
        return;
      }
    }

    // Clear pending changes and reload
    setPendingDeletions([]);
    setHistory([]);
    setHistoryIndex(-1);
    setSaved(true);
    await loadAnnotations();
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleConflictResolve(conflictIndex, resolution) {
    const conflict = conflicts[conflictIndex];
    const remainingConflicts = conflicts.filter((_, i) => i !== conflictIndex);

    if (resolution === "keep-new") {
      // Mark existing annotation for deletion
      setPendingDeletions((prev) => [...prev, conflict.existing]);
      // Remove from visible annotations
      setAnnotations((prev) => prev.filter((a) => a.id !== conflict.existing.id));
    } else if (resolution === "keep-existing") {
      // Remove the new annotation from the list
      setPendingAnnotations((prev) =>
        prev.filter((a) => a !== conflict.newAnnotation)
      );
      setAnnotations((prev) => prev.filter((a) => a !== conflict.newAnnotation));
    }
    // For "keep-both", do nothing - both will remain

    if (remainingConflicts.length === 0) {
      setShowConflicts(false);
      setConflicts([]);
      setPendingAnnotations([]);
      // Don't save immediately - let user click "Apply All Changes"
    } else {
      setConflicts(remainingConflicts);
    }
  }

  async function handleDownload() {
    if (!currentPiece?.pdf_url) {
      alert("No PDF available for this piece.");
      return;
    }

    setDownloading(true);
    try {
      await downloadPDFWithAnnotations(
        currentPiece.pdf_url,
        annotations.filter(a => a.piece_id === currentPiece.id),
        `${currentPiece.name.replace(/\s+/g, '-')}.pdf`
      );
      alert("PDF downloaded successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to download PDF: " + error.message);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDetectionComplete(detectedAnnotations) {
    if (!detectedAnnotations || detectedAnnotations.length === 0) {
      alert('No annotations were uploaded. Please try again.');
      return;
    }

    if (!currentPiece || !user) {
      alert('No piece or user found.');
      return;
    }

    // Verify user.id is the auth UUID (not profile.id)
    if (!user.id) {
      alert('User ID not found. Please log out and log back in.');
      return;
    }

    // Verify user has a profile with correct role (required by RLS policy)
    if (!profile) {
      alert('User profile not found. Please ensure your profile exists in the database.');
      console.error('Profile missing for user:', user.id);
      return;
    }

    if (!profile.role || !['student', 'teacher'].includes(profile.role)) {
      alert(`User role '${profile.role || 'none'}' is not allowed. Must be 'student' or 'teacher'.`);
      console.error('Invalid user role:', profile.role);
      return;
    }

    console.log('Current user:', { id: user.id, email: user.email, role: profile.role });

    // Map annotations to database rows - sticker_url is now a path, not a URL
    const rows = detectedAnnotations.map(a => ({
      piece_id: currentPiece.id,
      page: a.page,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      sticker_url: a.sticker_url,  // path string, from AnnotationDetector
      type: 'sticker',
      auto_detected: true,
      created_by: user.id,         // auth user UUID
    }));

    console.log('Inserting annotations:', rows);

    // Update local state immediately so the PDF updates right away
    setAnnotations(prev => {
      // Keep saved annotations (with id) and unsaved annotations for this piece
      const saved = prev.filter(a => a.id);
      const unsavedForThisPiece = prev.filter(a => !a.id && a.piece_id !== currentPiece.id);
      // Add new annotations with is_mine flag for display
      const withOwnership = rows.map(ann => ({
        ...ann,
        is_mine: true
      }));
      return [...saved, ...unsavedForThisPiece, ...withOwnership];
    });
    setSaved(false);

    const { error, data } = await supabase
      .from("annotations")
      .insert(rows)
      .select();

    if (error) {
      console.error('Error saving detected annotations:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      alert('Error saving detected annotations: ' + error.message + (error.details ? '\n' + error.details : ''));
      // Remove from state if save failed
      setAnnotations(prev => prev.filter(a => !rows.some(n => 
        n.x === a.x && n.y === a.y && n.page === a.page && !a.id
      )));
      return;
    }

    console.log('Saved detected annotations:', data);

    // Reload from DB so we have IDs and a clean state that matches what other users see
    await loadAnnotations();

    alert(
      `Added and saved ${rows.length} new annotation(s). They are now visible on this PDF and to other users.`
    );
  }

  async function handlePieceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert("Please upload a PDF file.");
      return;
    }

    setUploadingPiece(true);
    try {
      // Upload PDF to storage
      const fileName = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("stickers")
        .upload(fileName, file, { contentType: 'application/pdf' });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("stickers")
        .getPublicUrl(fileName);

      // Create piece record in database
      const pieceName = file.name.replace('.pdf', '').replace(/-/g, ' ');
      const pieceId = `piece-${Date.now()}`;
      
      const { error: dbError } = await supabase
        .from("pieces")
        .insert({
          id: pieceId,
          name: pieceName,
          pdf_url: urlData.publicUrl,
          base_pdf_url: urlData.publicUrl,
          created_by: user.id
        });

      if (dbError) {
        throw dbError;
      }

      alert("Piece uploaded successfully!");
      await loadPieces();
      e.target.value = ''; // Reset file input
    } catch (error) {
      console.error("Error uploading piece:", error);
      alert("Failed to upload piece: " + error.message);
    } finally {
      setUploadingPiece(false);
    }
  }

  async function handleDeletePiece(pieceId) {
    if (!window.confirm("Are you sure you want to delete this piece? This will also delete all annotations for this piece.")) {
      return;
    }

    try {
      // Delete from database (cascade will handle annotations)
      const { error } = await supabase
        .from("pieces")
        .delete()
        .eq("id", pieceId);

      if (error) throw error;

      // If deleted piece was current, switch to first available
      if (currentPiece?.id === pieceId) {
        const remaining = pieces.filter(p => p.id !== pieceId);
        setCurrentPiece(remaining.length > 0 ? remaining[0] : null);
      }

      await loadPieces();
      alert("Piece deleted successfully!");
    } catch (error) {
      console.error("Error deleting piece:", error);
      alert("Failed to delete piece: " + error.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setAnnotations([]);
    setPieces([]);
    setCurrentPiece(null);
  }

  if (!user) {
    return <Login onLogin={checkUser} />;
  }

  const currentPieceAnnotations = annotations.filter(a => !a.piece_id || a.piece_id === currentPiece);
  const newAnnotationsCount = currentPieceAnnotations.filter(a => !a.id).length;
  const deletionsCount = pendingDeletions.length;
  const totalChanges = newAnnotationsCount + deletionsCount;

  const getChangesText = () => {
    if (totalChanges === 0) return "No Changes";
    const parts = [];
    if (newAnnotationsCount > 0) parts.push(`${newAnnotationsCount} addition${newAnnotationsCount !== 1 ? 's' : ''}`);
    if (deletionsCount > 0) parts.push(`${deletionsCount} deletion${deletionsCount !== 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  return (
    <div style={{ padding: 20, fontFamily: "Gaegu, sans-serif", background: "#faf8f3", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: 20,
        padding: 15,
        background: "#d4f1d4",
        borderRadius: 8
      }}>
        <h1 style={{ margin: 0 }}>🎵 ScoreHub</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <span style={{ fontSize: 18 }}>
            <strong>{profile?.name}</strong> ({profile?.role})
          </span>
          <button
            onClick={logout}
            style={{
              padding: "8px 20px",
              background: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              fontFamily: "Gaegu, sans-serif",
              fontSize: 16,
            }}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Piece Selection */}
      <div style={{ 
        marginBottom: 20,
        padding: 15,
        background: "white",
        borderRadius: 8,
        border: "2px solid var(--accent-dark)"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <strong style={{ fontSize: 18 }}>📚 Select Piece: </strong>
            <select 
              value={currentPiece?.id || ''} 
              onChange={(e) => setCurrentPiece(pieces.find(p => p.id === e.target.value))}
              style={{
                padding: "8px 15px",
                fontSize: 16,
                fontFamily: "Gaegu, sans-serif",
                borderRadius: 5,
                border: "2px solid #4caf50",
                cursor: "pointer"
              }}
            >
              {pieces.length === 0 ? (
                <option value="">No pieces available</option>
              ) : (
                pieces.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))
              )}
            </select>
            <span style={{ color: "#666" }}>
              (Annotations are separate for each piece)
            </span>
          </div>
          {profile?.role === 'teacher' && (
            <button
              onClick={() => setShowPieceManager(!showPieceManager)}
              style={{
                padding: "8px 15px",
                background: showPieceManager ? "#ff9800" : "#4caf50",
                color: "white",
                border: "none",
                borderRadius: 5,
                cursor: "pointer",
                fontFamily: "Gaegu, sans-serif",
                fontSize: 14,
                fontWeight: "bold"
              }}
            >
              {showPieceManager ? "✕ Close Manager" : "⚙️ Manage Pieces"}
            </button>
          )}
        </div>
        
        {/* Piece Management UI (Teachers only) */}
        {showPieceManager && profile?.role === 'teacher' && (
          <div style={{ 
            marginTop: 20, 
            padding: 20, 
            background: "#f0f8ff", 
            borderRadius: 8,
            border: "2px solid #4caf50"
          }}>
            <h3 style={{ marginTop: 0, color: "#4caf50" }}>📁 Piece Management</h3>
            
            {/* Upload New Piece */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 10, fontWeight: "bold" }}>
                Upload New Piece (PDF):
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePieceUpload}
                disabled={uploadingPiece}
                style={{
                  padding: "8px",
                  border: "2px dashed #4caf50",
                  borderRadius: 5,
                  width: "100%",
                  cursor: uploadingPiece ? 'wait' : 'pointer'
                }}
              />
              {uploadingPiece && <p style={{ color: "#666", marginTop: 5 }}>⏳ Uploading...</p>}
            </div>

            {/* List of Pieces */}
            <div>
              <strong style={{ display: "block", marginBottom: 10 }}>All Pieces ({pieces.length}):</strong>
              {pieces.length === 0 ? (
                <p style={{ color: "#666", fontStyle: "italic" }}>No pieces uploaded yet. Upload a PDF to get started!</p>
              ) : (
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {pieces.map(piece => (
                    <div
                      key={piece.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px",
                        marginBottom: 8,
                        background: currentPiece?.id === piece.id ? "#e8f5e9" : "white",
                        border: currentPiece?.id === piece.id ? "2px solid #4caf50" : "1px solid #ddd",
                        borderRadius: 5
                      }}
                    >
                      <div>
                        <strong>{piece.name}</strong>
                        {currentPiece?.id === piece.id && <span style={{ marginLeft: 10, color: "#4caf50" }}>✓ Current</span>}
                      </div>
                      <button
                        onClick={() => handleDeletePiece(piece.id)}
                        style={{
                          padding: "5px 15px",
                          background: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: 5,
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AnnotationCanvas
        annotations={annotations}
        addAnnotation={addAnnotation}
        deleteAnnotation={deleteAnnotation}
        user={user}
        profile={profile}
        currentPieceId={currentPiece}
      />
      <div style={{ 
        display: "flex", 
        gap: 15,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          style={{
            padding: "10px 20px",
            background: historyIndex > 0 ? "var(--accent-mint)" : "#ccc",
            color: "var(--accent-dark)",
            fontSize: 16,
            cursor: historyIndex > 0 ? "pointer" : "not-allowed",
            opacity: historyIndex > 0 ? 1 : 0.6,
          }}
          title="Undo last change"
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          style={{
            padding: "10px 20px",
            background: historyIndex < history.length - 1 ? "var(--accent-mint)" : "#ccc",
            color: "var(--accent-dark)",
            fontSize: 16,
            cursor: historyIndex < history.length - 1 ? "pointer" : "not-allowed",
            opacity: historyIndex < history.length - 1 ? 1 : 0.6,
          }}
          title="Redo last undone change"
        >
          ↷ Redo
        </button>
        <button
          onClick={saveAnnotations}
          disabled={totalChanges === 0}
          style={{
            padding: "12px 25px",
            background: saved ? "var(--secondary)" : (totalChanges > 0 ? "var(--accent-dark)" : "#ccc"),
            color: saved ? "var(--accent-dark)" : (totalChanges > 0 ? "white" : "#666"),
            fontSize: 16,
            cursor: totalChanges > 0 ? "pointer" : "not-allowed",
            fontWeight: 700
          }}
        >
          {saved ? "✓ Changes Saved!" : `Apply All Changes (${getChangesText()})`}
        </button>
        
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            padding: "12px 25px",
            background: showHistory ? "#ff9800" : "#6c757d",
            color: "white",
            border: "none",
            borderRadius: 5,
            cursor: "pointer",
            fontWeight: showHistory ? "bold" : "normal",
            fontSize: 16,
            fontFamily: "Gaegu, sans-serif",
          }}
        >
          {showHistory ? "✕ Hide History" : "📜 View History"}
        </button>
      </div>

      {showHistory && <VersionHistory currentPieceId={currentPiece?.id} />}
      
      {showDetector && (
        <AnnotationDetector
          basePdfUrl={currentPiece?.pdf_url}
          onDetectionComplete={handleDetectionComplete}
          onClose={() => setShowDetector(false)}
          currentPiece={currentPiece}
          user={user}
        />
      )}
      
      {showConflicts && (
        <ConflictResolver
          conflicts={conflicts}
          onResolve={handleConflictResolve}
          onClose={() => {
            // When closing conflict resolver, remove the conflicting new annotations
            // but keep the existing ones
            const conflictingNewAnnotations = conflicts.map(c => c.newAnnotation);
            setAnnotations(prev => prev.filter(a => !conflictingNewAnnotations.includes(a)));
            setShowConflicts(false);
            setConflicts([]);
            setPendingAnnotations([]);
          }}
          currentUserProfile={profile}
        />
      )}
    </div>
  );
}
