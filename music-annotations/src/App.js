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
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data);
  }

  async function loadAnnotations() {
    const { data, error } = await supabase.from("annotations").select("*");
    if (error) console.error(error);
    else setAnnotations(data || []);
  }

  const addAnnotation = (a) => {
    setAnnotations((prev) => [
      ...prev,
      { ...a, created_by: user.id, version: 1 },
    ]);
    setSaved(false);
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
    if (newOnes.length === 0) return alert("No new annotations to save!");

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

    const { error } = await supabase.from("annotations").insert(newOnes);
    if (error) {
      console.error(error);
      alert("Error saving annotations: " + error.message);
    } else {
      setSaved(true);
      await loadAnnotations();
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleConflictResolve(conflictIndex, resolution) {
    const conflict = conflicts[conflictIndex];
    const remainingConflicts = conflicts.filter((_, i) => i !== conflictIndex);

    if (resolution === "keep-new") {
      await supabase
        .from("annotations")
        .delete()
        .eq("id", conflict.existing.id);
    } else if (resolution === "keep-existing") {
      setPendingAnnotations((prev) =>
        prev.filter((a) => a !== conflict.newAnnotation)
      );
    }

    if (remainingConflicts.length === 0) {
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
          setSaved(true);
          await loadAnnotations();
          setTimeout(() => setSaved(false), 2000);
        }
      }
      setConflicts([]);
      setPendingAnnotations([]);
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

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Sheet Music Annotations</h1>
        <div>
          <span style={{ marginRight: 20 }}>
            {profile?.name} ({profile?.role})
          </span>
          <button
            onClick={logout}
            style={{
              padding: "5px 15px",
              background: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
            }}
          >
            Log Out
          </button>
        </div>
      </div>

      <div style={{ 
        marginBottom: 20, 
        padding: 15, 
        background: "#d4f1d4", 
        borderRadius: 8,
        border: "2px solid #4caf50"
      }}>
        <strong style={{ fontSize: 18 }}>📚 Select Piece: </strong>
        <select 
          value={currentPiece} 
          onChange={(e) => setCurrentPiece(e.target.value)}
          style={{
            marginLeft: 10,
            padding: "8px 15px",
            fontSize: 16,
            fontFamily: "Gaegu, sans-serif",
            borderRadius: 5,
            border: "2px solid #4caf50",
            cursor: "pointer"
          }}
        >
          {pieces.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span style={{ marginLeft: 15, color: "#666" }}>
          (Annotations are separate for each piece)
        </span>
      </div>

      <AnnotationCanvas
        annotations={annotations}
        addAnnotation={addAnnotation}
        user={user}
        profile={profile}
        currentPieceId={currentPiece}
      />
      <button
        onClick={saveAnnotations}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: saved ? "#4caf50" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: 5,
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        {saved ? "✓ Changes Saved!" : `Apply All Changes (${annotations.filter(a => !a.id).length} new)`}
      </button>
      <button
        onClick={() => setShowHistory(!showHistory)}
        style={{
          marginTop: "20px",
          marginLeft: "10px",
          padding: "10px 20px",
          background: showHistory ? "#ff9800" : "#6c757d",
          color: "white",
          border: "none",
          borderRadius: 5,
          cursor: "pointer",
          fontWeight: showHistory ? "bold" : "normal",
        }}
      >
        {showHistory ? "✕ Hide History" : "📜 View History"}
      </button>
      {showHistory && <VersionHistory currentPieceId={currentPiece} />}
      {showConflicts && (
        <ConflictResolver
          conflicts={conflicts}
          onResolve={handleConflictResolve}
          onClose={() => {
            setShowConflicts(false);
            setConflicts([]);
            setPendingAnnotations([]);
          }}
        />
      )}
    </div>
  );
}
