import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import PDFViewer from "./PDFViewer";
import AnnotationDetector from "./AnnotationDetector";
import { downloadPDFWithAnnotations } from "./PDFDownloader";
import Login from "./Login";
import HomePage from "./HomePage";
import VersionHistory from "./VersionHistory";
import ConflictResolver from "./ConflictResolver";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [currentPiece, setCurrentPiece] = useState(null);
  const [userRoleInPiece, setUserRoleInPiece] = useState(null);
  const [currentView, setCurrentView] = useState("home"); // "home" or "piece"
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetector, setShowDetector] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const [pendingAnnotations, setPendingAnnotations] = useState([]);
  const [pendingDeletions, setPendingDeletions] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pieces, setPieces] = useState([]);
  const [showPieceManager, setShowPieceManager] = useState(false);
  const [uploadingPiece, setUploadingPiece] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);

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

  // Removed loadPieces useEffect - pieces are now loaded in HomePage

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

  // Removed loadPieces - pieces are now loaded per user in HomePage via piece_members table

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
      // Note: role is now per-piece (in piece_members table), not global
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const newProfile = {
          user_id: userId,
          email: user.email,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          // No role field - roles are now in piece_members table
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
    if (!currentPiece) return;
    
    const { data, error } = await supabase
      .from("annotations")
      .select("*")
      .eq("piece_id", currentPiece.id);
    
    if (error) {
      console.error("Error loading annotations:", error);
    } else {
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
    // Permission check: students can only delete their own, teachers (in this piece) can delete any
    const isMine = annotation.created_by === user.id;
    const isTeacherInPiece = userRoleInPiece === "teacher";
    
    if (!isTeacherInPiece && !isMine) {
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
      // Delete existing annotation from database
      await supabase
        .from("annotations")
        .delete()
        .eq("id", conflict.existing.id);
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
      // All conflicts resolved - save the pending annotations
      setShowConflicts(false);
      
      const toSave = pendingAnnotations.filter((a) =>
        conflicts.every((c) => c.newAnnotation !== a || resolution !== "keep-existing")
      );
      
      if (toSave.length > 0) {
        const { error } = await supabase.from("annotations").insert(toSave);
        if (error) {
          console.error(error);
          alert("Error saving annotations: " + error.message);
        } else {
          await loadAnnotations();
          alert(`Successfully saved ${toSave.length} annotation(s)!`);
        }
      }
      
      setConflicts([]);
      setPendingAnnotations([]);
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

    // Verify user has a profile
    if (!profile) {
      alert('User profile not found. Please ensure your profile exists in the database.');
      console.error('Profile missing for user:', user.id);
      return;
    }

    // Verify user has a role in this piece
    if (!userRoleInPiece || !['student', 'teacher'].includes(userRoleInPiece)) {
      alert(`You don't have permission to annotate this piece. Please join the piece first.`);
      console.error('Invalid or missing role in piece:', userRoleInPiece);
      return;
    }

    console.log('Current user:', { id: user.id, email: user.email, roleInPiece: userRoleInPiece });

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

    // Check for conflicts before saving
    const existingAnnotations = annotations.filter((a) => a.id);
    const foundConflicts = detectConflicts(rows, existingAnnotations);

    if (foundConflicts.length > 0) {
      // Get creator info with their role IN THIS PIECE
      const conflictsWithCreators = await Promise.all(
        foundConflicts.map(async (conflict) => {
          // Get profile name
          const { data: creatorProfile } = await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", conflict.existing.created_by)
            .single();
          
          // Get role in this piece
          const { data: creatorRole } = await supabase
            .from("piece_members")
            .select("role")
            .eq("piece_id", currentPiece.id)
            .eq("user_id", conflict.existing.created_by)
            .single();
          
          return { 
            ...conflict, 
            existingCreator: {
              name: creatorProfile?.name || "Unknown",
              role: creatorRole?.role || "student"
            }
          };
        })
      );

      // Check if student trying to override teacher annotations (in this piece)
      const isStudentInPiece = userRoleInPiece === "student";
      const hasTeacherConflicts = conflictsWithCreators.some(
        c => c.existingCreator?.role === "teacher"
      );

      if (isStudentInPiece && hasTeacherConflicts) {
        alert(
          `Cannot upload annotations: ${foundConflicts.length} annotation(s) conflict with existing teacher annotations. ` +
          `Students cannot override teacher annotations.`
        );
        return;
      }

      // Teacher or student with student conflicts - show resolver
      // Add new annotations to local state temporarily
      setAnnotations(prev => [...prev, ...rows]);
      setConflicts(conflictsWithCreators);
      setPendingAnnotations(rows);
      setShowConflicts(true);
      return;
    }

    // No conflicts - save directly
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
      // Note: Piece upload should now be done via HomePage
      e.target.value = ''; // Reset file input
    } catch (error) {
      console.error("Error uploading piece:", error);
      alert("Failed to upload piece: " + error.message);
    } finally {
      setUploadingPiece(false);
    }
  }

  async function handleUploadPDFToPiece(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert("Please upload a PDF file.");
      return;
    }

    if (!currentPiece) {
      alert("No piece selected.");
      return;
    }

    setUploadingPiece(true);
    try {
      // Upload PDF to storage
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
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

      // Update piece record with PDF URL
      const { error: dbError } = await supabase
        .from("pieces")
        .update({
          pdf_url: urlData.publicUrl,
          base_pdf_url: urlData.publicUrl
        })
        .eq("id", currentPiece.id);

      if (dbError) {
        throw dbError;
      }

      // Update local state
      setCurrentPiece({
        ...currentPiece,
        pdf_url: urlData.publicUrl,
        base_pdf_url: urlData.publicUrl
      });

      alert("PDF uploaded successfully!");
      e.target.value = ''; // Reset file input
    } catch (error) {
      console.error("Error uploading PDF:", error);
      alert("Failed to upload PDF: " + error.message);
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

      // If deleted piece was current, return to home
      if (currentPiece?.id === pieceId) {
        handleBackToHome();
      }

      // Note: Piece deletion should now be done via HomePage
      alert("Piece deleted successfully!");
    } catch (error) {
      console.error("Error deleting piece:", error);
      alert("Failed to delete piece: " + error.message);
    }
  }

  async function revertToVersion(timestamp) {
    if (!window.confirm(`Are you sure you want to revert all annotations to this version? This will delete all annotations created after ${new Date(timestamp).toLocaleString()}.`)) {
      return;
    }

    try {
      // Delete all annotations created after this timestamp for this piece
      const { error } = await supabase
        .from("annotations")
        .delete()
        .eq("piece_id", currentPiece.id)
        .gt("created_at", timestamp);

      if (error) throw error;

      await loadAnnotations();
      alert("Successfully reverted to selected version!");
    } catch (error) {
      console.error("Error reverting:", error);
      alert("Failed to revert: " + error.message);
    }
  }

  async function handleSelectPiece(piece, role) {
    setCurrentPiece(piece);
    setUserRoleInPiece(role);
    setCurrentView("piece");
    await loadAnnotations();
  }

  function handleBackToHome() {
    setCurrentPiece(null);
    setUserRoleInPiece(null);
    setCurrentView("home");
    setAnnotations([]);
    setShowHistory(false);
    setShowDetector(false);
    setIsDeleteMode(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setAnnotations([]);
    setPieces([]);
    setCurrentPiece(null);
    setUserRoleInPiece(null);
    setCurrentView("home");
  }

  if (!user) {
    return <Login onLogin={checkUser} />;
  }

  // Show home page if no piece is selected
  if (currentView === "home") {
    return (
      <HomePage
        user={user}
        profile={profile}
        onSelectPiece={handleSelectPiece}
        onLogout={logout}
      />
    );
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
    <div style={{ 
      padding: "max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))", 
      fontFamily: "Gaegu, sans-serif", 
      background: "#faf8f3", 
      minHeight: "100vh",
      maxWidth: "100%",
      overflowX: "hidden"
    }}>
      {/* Header */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: 20,
        padding: "15px 20px",
        background: "#d4f1d4",
        borderRadius: 8,
        flexWrap: "wrap",
        gap: "15px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15, flexWrap: "wrap" }}>
          <button
            onClick={handleBackToHome}
            style={{
              padding: "10px 16px",
              background: "var(--accent-dark)",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: "18px",
              minHeight: "44px",
              touchAction: "manipulation"
            }}
          >
            ← Back
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px" }}>🎵 {currentPiece?.name}</h1>
            <span style={{
              fontSize: "14px",
              padding: "4px 10px",
              background: userRoleInPiece === "teacher" ? "#ff6b6b" : "#4caf50",
              color: "white",
              borderRadius: 5,
              fontWeight: 700,
              marginLeft: 5
            }}>
              {userRoleInPiece === "teacher" ? "🎓 Teacher" : "📚 Student"}
            </span>
            {userRoleInPiece === "teacher" && currentPiece?.access_code && (
              <>
                <span style={{
                  fontSize: "14px",
                  padding: "4px 10px",
                  background: "#2196f3",
                  color: "white",
                  borderRadius: 5,
                  fontWeight: 700,
                  marginLeft: 10,
                  cursor: "text",
                  userSelect: "all",
                  fontFamily: "monospace"
                }}>
                  Code: {currentPiece.access_code}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(currentPiece.access_code);
                    alert("Access code copied!");
                  }}
                  style={{
                    padding: "4px 10px",
                    background: "#1976d2",
                    color: "white",
                    border: "none",
                    borderRadius: 5,
                    cursor: "pointer",
                    fontSize: "12px",
                    fontFamily: "Gaegu, sans-serif",
                    marginLeft: 5,
                    minHeight: "28px"
                  }}
                >
                  📋
                </button>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 15, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>
            <strong>{profile?.name}</strong>
          </span>
          <button
            onClick={logout}
            style={{
              padding: "12px 24px",
              background: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "Gaegu, sans-serif",
              fontSize: "18px",
              minHeight: "48px",
              touchAction: "manipulation"
            }}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* No PDF Yet - Upload Option */}
      {currentPiece && !currentPiece.pdf_url && (
        <div style={{
          marginBottom: 20,
          padding: "40px",
          background: "white",
          borderRadius: 8,
          border: "3px dashed var(--accent-dark)",
          textAlign: "center"
        }}>
          <h2 style={{ marginTop: 0, color: "var(--accent-dark)" }}>📄 No PDF Yet</h2>
          <p style={{ fontSize: "18px", color: "#666", marginBottom: 25 }}>
            {userRoleInPiece === "teacher" 
              ? "Upload a PDF to start annotating this piece."
              : "The teacher hasn't uploaded a PDF yet. Check back later!"}
          </p>
          
          {userRoleInPiece === "teacher" && (
            <div>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleUploadPDFToPiece}
                disabled={uploadingPiece}
                id="pdf-upload"
                style={{ display: "none" }}
              />
              <label
                htmlFor="pdf-upload"
                style={{
                  display: "inline-block",
                  padding: "16px 32px",
                  background: uploadingPiece ? "#ccc" : "#4caf50",
                  color: "white",
                  borderRadius: 8,
                  cursor: uploadingPiece ? "not-allowed" : "pointer",
                  fontSize: "20px",
                  fontWeight: 700,
                  fontFamily: "Gaegu, sans-serif",
                  minHeight: "56px",
                  touchAction: "manipulation"
                }}
              >
                {uploadingPiece ? "⏳ Uploading..." : "📤 Upload PDF"}
              </label>
              <p style={{ fontSize: "14px", color: "#999", marginTop: 10 }}>
                Accepted format: PDF files only
              </p>
            </div>
          )}
        </div>
      )}

      {/* PDF Controls */}
      {currentPiece?.pdf_url && (
        <div style={{
          marginBottom: 15,
          padding: "20px",
          background: "white",
          borderRadius: 8,
          border: "2px solid var(--accent-dark)",
          display: "flex",
          gap: "15px",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <button
            onClick={() => setShowDetector(true)}
            style={{
              padding: "14px 28px",
              background: "#2196f3",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: "18px",
              fontFamily: "Gaegu, sans-serif",
              fontWeight: 700,
              minHeight: "50px",
              touchAction: "manipulation"
            }}
            title="Upload an annotated PDF to detect and import annotations"
          >
            📤 Upload Annotations
          </button>
          
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              padding: "14px 28px",
              background: downloading ? "#ccc" : "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: downloading ? "not-allowed" : "pointer",
              fontSize: "18px",
              fontFamily: "Gaegu, sans-serif",
              fontWeight: 700,
              minHeight: "50px",
              touchAction: "manipulation"
            }}
            title="Download PDF with current annotations"
          >
            {downloading ? "⏳ Downloading..." : "📥 Download PDF"}
          </button>
          
          <button
            onClick={() => setIsDeleteMode(!isDeleteMode)}
            style={{
              padding: "14px 28px",
              background: isDeleteMode ? "#ff6b6b" : "#dc3545",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: "18px",
              fontFamily: "Gaegu, sans-serif",
              fontWeight: 700,
              minHeight: "50px",
              touchAction: "manipulation"
            }}
            title={isDeleteMode ? "Exit delete mode" : "Enter delete mode to remove annotations"}
          >
            {isDeleteMode ? "✓ Exit Delete Mode" : "🗑️ Delete Mode"}
          </button>
        </div>
      )}
      
      {isDeleteMode && currentPiece?.pdf_url && (
        <div style={{
          marginBottom: 15,
          padding: 15,
          background: "#ff6b6b",
          color: "white",
          borderRadius: 8,
          border: "2px solid #c92a2a",
          fontWeight: 700,
          textAlign: "center",
          fontSize: "18px"
        }}>
          🗑️ DELETE MODE ACTIVE - Click any annotation to delete it
          {userRoleInPiece === 'student' && <span> (You can only delete your own annotations)</span>}
        </div>
      )}

      {currentPiece?.pdf_url && (
        <PDFViewer
          pdfUrl={currentPiece.pdf_url}
          annotations={annotations.filter(a => a.piece_id === currentPiece.id)}
          addAnnotation={addAnnotation}
          deleteAnnotation={deleteAnnotation}
          user={user}
          profile={{ ...profile, role: userRoleInPiece }}
          currentPiece={currentPiece}
          isDeleteMode={isDeleteMode}
        />
      )}
      
      <div style={{ 
        display: "flex", 
        gap: "15px",
        flexWrap: "wrap",
        alignItems: "center",
        marginTop: 20,
        justifyContent: "center"
      }}>
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          style={{
            padding: "14px 24px",
            background: historyIndex > 0 ? "var(--accent-mint)" : "#ccc",
            color: "var(--accent-dark)",
            fontSize: "18px",
            cursor: historyIndex > 0 ? "pointer" : "not-allowed",
            opacity: historyIndex > 0 ? 1 : 0.6,
            border: "none",
            borderRadius: 8,
            fontFamily: "Gaegu, sans-serif",
            minHeight: "50px",
            minWidth: "120px",
            touchAction: "manipulation"
          }}
          title="Undo last change"
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          style={{
            padding: "14px 24px",
            background: historyIndex < history.length - 1 ? "var(--accent-mint)" : "#ccc",
            color: "var(--accent-dark)",
            fontSize: "18px",
            cursor: historyIndex < history.length - 1 ? "pointer" : "not-allowed",
            opacity: historyIndex < history.length - 1 ? 1 : 0.6,
            border: "none",
            borderRadius: 8,
            fontFamily: "Gaegu, sans-serif",
            minHeight: "50px",
            minWidth: "120px",
            touchAction: "manipulation"
          }}
          title="Redo last undone change"
        >
          ↷ Redo
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            padding: "14px 28px",
            background: showHistory ? "#ff9800" : "#6c757d",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: showHistory ? "bold" : "normal",
            fontSize: "18px",
            fontFamily: "Gaegu, sans-serif",
            minHeight: "50px",
            touchAction: "manipulation"
          }}
        >
          {showHistory ? "✕ Hide History" : "📜 View History"}
        </button>
      </div>

      {showHistory && (
        <VersionHistory 
          currentPieceId={currentPiece?.id} 
          onRevert={revertToVersion}
          userRole={userRoleInPiece}
        />
      )}
      
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
          currentUserProfile={{ ...profile, role: userRoleInPiece }}
        />
      )}
    </div>
  );
}
