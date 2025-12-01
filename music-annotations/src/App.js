import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import AnnotationCanvas from "./AnnotationCanvas";
import Login from "./Login";
import VersionHistory from "./VersionHistory";
import ConflictResolver from "./ConflictResolver";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
          loadAnnotations();
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
      loadAnnotations();
    }
  }, [currentPiece, user]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setUser(data.session.user);
      loadProfile(data.session.user.id);
      loadAnnotations();
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
        if (existing.piece_id !== newA.piece_id) return;
        
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

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setAnnotations([]);
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
    <div style={{ padding: 30, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: 20,
        padding: 20,
        background: "var(--secondary)",
        borderRadius: 8,
        border: "3px solid var(--accent-dark)"
      }}>
        <h1 style={{ margin: 0 }}>Sheet Music Annotations</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <span style={{ 
            fontWeight: 700,
            color: "var(--accent-dark)",
            background: "var(--accent-mint)",
            padding: "8px 15px",
            borderRadius: 5
          }}>
            {profile?.name} ({profile?.role})
          </span>
          <button
            onClick={logout}
            style={{
              padding: "8px 15px",
              background: "var(--accent-pink)",
              color: "var(--accent-dark)"
            }}
          >
            Log Out
          </button>
        </div>
      </div>

      <div style={{ 
        marginBottom: 20, 
        padding: 20, 
        background: "white", 
        borderRadius: 8,
        border: "2px solid var(--accent-dark)"
      }}>
        <label style={{ 
          fontSize: 18, 
          display: "inline-block",
          marginRight: 15
        }}>
          📚 Select Piece
        </label>
        <select 
          value={currentPiece} 
          onChange={(e) => setCurrentPiece(e.target.value)}
          style={{
            padding: "8px 15px",
            fontSize: 16
          }}
        >
          {pieces.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span style={{ marginLeft: 15, color: "var(--accent-dark)", fontSize: 14 }}>
          (Annotations are separate for each piece)
        </span>
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
        marginTop: 20, 
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
            background: showHistory ? "var(--accent-mint)" : "var(--accent-dark)",
            color: showHistory ? "var(--accent-dark)" : "white",
            fontSize: 16
          }}
        >
          {showHistory ? "✕ Hide History" : "📜 View History"}
        </button>
      </div>
      {showHistory && <VersionHistory currentPieceId={currentPiece} />}
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
