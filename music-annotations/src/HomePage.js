import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function HomePage({ user, profile, onSelectPiece, onLogout }) {
  const [userPieces, setUserPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [newPieceName, setNewPieceName] = useState("");
  const [joinRole, setJoinRole] = useState("student");
  const [createRole, setCreateRole] = useState("teacher");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadUserPieces();
  }, [user]);

  async function loadUserPieces() {
    setLoading(true);
    try {
      // Get all pieces the user is a member of
      const { data, error } = await supabase
        .from("piece_members")
        .select(`
          role,
          joined_at,
          piece_id,
          pieces (
            id,
            name,
            pdf_url,
            access_code,
            created_by
          )
        `)
        .eq("user_id", user.id);

      if (error) throw error;

      setUserPieces(data || []);
    } catch (error) {
      console.error("Error loading pieces:", error);
      alert("Failed to load pieces: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinPiece() {
    if (!accessCode.trim()) {
      alert("Please enter an access code");
      return;
    }

    setJoining(true);
    try {
      // Find piece by access code
      const { data: piece, error: pieceError } = await supabase
        .from("pieces")
        .select("id, name")
        .eq("access_code", accessCode.toUpperCase())
        .single();

      if (pieceError || !piece) {
        alert("Invalid access code");
        return;
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("piece_members")
        .select("id")
        .eq("piece_id", piece.id)
        .eq("user_id", user.id)
        .single();

      if (existing) {
        alert("You're already a member of this piece!");
        setShowJoinModal(false);
        setAccessCode("");
        return;
      }

      // Add with selected role
      const { error: joinError } = await supabase
        .from("piece_members")
        .insert({
          piece_id: piece.id,
          user_id: user.id,
          role: joinRole,
        });

      if (joinError) throw joinError;

      alert(`Successfully joined "${piece.name}" as ${joinRole}!`);
      setShowJoinModal(false);
      setAccessCode("");
      setJoinRole("student");
      await loadUserPieces();
    } catch (error) {
      console.error("Error joining piece:", error);
      alert("Failed to join piece: " + error.message);
    } finally {
      setJoining(false);
    }
  }

  async function handleCreatePiece() {
    if (!newPieceName.trim()) {
      alert("Please enter a piece name");
      return;
    }

    setCreating(true);
    try {
      // Generate access code
      const accessCode = generateAccessCode();
      const pieceId = `piece-${Date.now()}`;

      // Create piece
      const { error: pieceError } = await supabase
        .from("pieces")
        .insert({
          id: pieceId,
          name: newPieceName,
          access_code: accessCode,
          created_by: user.id,
        });

      if (pieceError) throw pieceError;

      // Add creator with selected role
      const { error: memberError } = await supabase
        .from("piece_members")
        .insert({
          piece_id: pieceId,
          user_id: user.id,
          role: createRole,
        });

      if (memberError) throw memberError;

      alert(`Piece created! Access code: ${accessCode}\nYour role: ${createRole}`);
      setShowCreateModal(false);
      setNewPieceName("");
      setCreateRole("teacher");
      await loadUserPieces();
    } catch (error) {
      console.error("Error creating piece:", error);
      alert("Failed to create piece: " + error.message);
    } finally {
      setCreating(false);
    }
  }

  function generateAccessCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  if (loading) {
    return (
      <div style={{ padding: "50px", textAlign: "center" }}>
        <h2>Loading your pieces...</h2>
      </div>
    );
  }

  return (
    <div style={{
      padding: "max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
      fontFamily: "Gaegu, sans-serif",
      background: "#faf8f3",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 30,
        padding: "20px",
        background: "#d4f1d4",
        borderRadius: 8,
        flexWrap: "wrap",
        gap: "15px"
      }}>
        <h1 style={{ margin: 0 }}>🎵 ScoreHub</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 15, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>
            <strong>{profile?.name}</strong>
          </span>
          <button
            onClick={onLogout}
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
            Logout
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        marginBottom: 30,
        display: "flex",
        gap: "15px",
        flexWrap: "wrap",
        justifyContent: "center"
      }}>
        <button
          onClick={() => setShowJoinModal(true)}
          style={{
            padding: "16px 32px",
            background: "#2196f3",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: "20px",
            fontWeight: 700,
            minHeight: "56px",
            touchAction: "manipulation"
          }}
        >
          ➕ Join Piece
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: "16px 32px",
            background: "#4caf50",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: "20px",
            fontWeight: 700,
            minHeight: "56px",
            touchAction: "manipulation"
          }}
        >
          ✨ Create Piece
        </button>
      </div>

      {/* Pieces Grid */}
      <div>
        <h2 style={{ marginBottom: 20, textAlign: "center" }}>
          My Pieces ({userPieces.length})
        </h2>
        {userPieces.length === 0 ? (
          <div style={{
            padding: "60px 20px",
            background: "white",
            borderRadius: 8,
            border: "2px dashed var(--accent-dark)",
            textAlign: "center"
          }}>
            <h3>No pieces yet!</h3>
            <p style={{ fontSize: "18px", color: "#666" }}>
              Join a piece with an access code or create a new one.
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "20px"
          }}>
            {userPieces.map((membership) => (
              <div
                key={membership.piece_id}
                onClick={() => onSelectPiece(membership.pieces, membership.role)}
                style={{
                  padding: "25px",
                  background: "white",
                  borderRadius: 8,
                  border: "3px solid var(--accent-dark)",
                  cursor: "pointer",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  touchAction: "manipulation"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 15
                }}>
                  <h3 style={{ margin: 0, fontSize: "22px" }}>
                    {membership.pieces.name}
                  </h3>
                  <span style={{
                    padding: "6px 12px",
                    background: membership.role === "teacher" ? "#ff6b6b" : "#4caf50",
                    color: "white",
                    borderRadius: 5,
                    fontSize: "14px",
                    fontWeight: 700
                  }}>
                    {membership.role === "teacher" ? "🎓 Teacher" : "📚 Student"}
                  </span>
                </div>
                
                {membership.role === "teacher" && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: "10px",
                      background: "#f0f0f0",
                      borderRadius: 5,
                      marginTop: 10,
                      fontSize: "16px",
                      cursor: "text",
                      userSelect: "text"
                    }}
                  >
                    <strong>Access Code:</strong>{" "}
                    <span style={{
                      fontFamily: "monospace",
                      fontSize: "18px",
                      fontWeight: "bold",
                      color: "#2196f3",
                      userSelect: "all"
                    }}>
                      {membership.pieces.access_code}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(membership.pieces.access_code);
                        alert("Access code copied!");
                      }}
                      style={{
                        marginLeft: "10px",
                        padding: "4px 12px",
                        background: "#2196f3",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: "12px",
                        fontFamily: "Gaegu, sans-serif"
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                )}
                
                <div style={{ marginTop: 15, fontSize: "14px", color: "#666" }}>
                  Joined {new Date(membership.joined_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Join Modal */}
      {showJoinModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: 8,
            maxWidth: "500px",
            width: "90%",
            border: "3px solid var(--accent-dark)"
          }}>
            <h2 style={{ marginTop: 0 }}>Join a Piece</h2>
            <p style={{ fontSize: "16px", marginBottom: 20 }}>
              Enter the access code and select your role:
            </p>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="ACCESS CODE"
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "20px",
                marginBottom: 20,
                borderRadius: 8,
                border: "2px solid var(--accent-dark)",
                textAlign: "center",
                fontFamily: "monospace",
                letterSpacing: "2px",
                touchAction: "manipulation",
                boxSizing: "border-box"
              }}
              maxLength={8}
            />
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 10, fontWeight: "bold", fontSize: "16px" }}>
                Join as:
              </label>
              <select
                value={joinRole}
                onChange={(e) => setJoinRole(e.target.value)}
                style={{
                  width: "100%",
                  padding: "16px",
                  fontSize: "18px",
                  borderRadius: 8,
                  border: "2px solid var(--accent-dark)",
                  fontFamily: "Gaegu, sans-serif",
                  cursor: "pointer",
                  touchAction: "manipulation",
                  boxSizing: "border-box"
                }}
              >
                <option value="student">📚 Student</option>
                <option value="teacher">🎓 Teacher</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "15px" }}>
              <button
                onClick={handleJoinPiece}
                disabled={joining}
                style={{
                  flex: 1,
                  padding: "16px",
                  background: joining ? "#ccc" : "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: joining ? "not-allowed" : "pointer",
                  fontSize: "18px",
                  fontWeight: 700,
                  minHeight: "56px",
                  touchAction: "manipulation"
                }}
              >
                {joining ? "Joining..." : "Join"}
              </button>
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setAccessCode("");
                  setJoinRole("student");
                }}
                style={{
                  flex: 1,
                  padding: "16px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: "18px",
                  minHeight: "56px",
                  touchAction: "manipulation"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: 8,
            maxWidth: "500px",
            width: "90%",
            border: "3px solid var(--accent-dark)"
          }}>
            <h2 style={{ marginTop: 0 }}>Create New Piece</h2>
            <p style={{ fontSize: "16px", marginBottom: 20 }}>
              Enter a name and select your role:
            </p>
            <input
              type="text"
              value={newPieceName}
              onChange={(e) => setNewPieceName(e.target.value)}
              placeholder="e.g., Symphony No. 5"
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "18px",
                marginBottom: 20,
                borderRadius: 8,
                border: "2px solid var(--accent-dark)",
                fontFamily: "Gaegu, sans-serif",
                touchAction: "manipulation",
                boxSizing: "border-box"
              }}
            />
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 10, fontWeight: "bold", fontSize: "16px" }}>
                Your role:
              </label>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
                style={{
                  width: "100%",
                  padding: "16px",
                  fontSize: "18px",
                  borderRadius: 8,
                  border: "2px solid var(--accent-dark)",
                  fontFamily: "Gaegu, sans-serif",
                  cursor: "pointer",
                  touchAction: "manipulation",
                  boxSizing: "border-box"
                }}
              >
                <option value="teacher">🎓 Teacher</option>
                <option value="student">📚 Student</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "15px" }}>
              <button
                onClick={handleCreatePiece}
                disabled={creating}
                style={{
                  flex: 1,
                  padding: "16px",
                  background: creating ? "#ccc" : "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: creating ? "not-allowed" : "pointer",
                  fontSize: "18px",
                  fontWeight: 700,
                  minHeight: "56px",
                  touchAction: "manipulation"
                }}
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewPieceName("");
                  setCreateRole("teacher");
                }}
                style={{
                  flex: 1,
                  padding: "16px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: "18px",
                  minHeight: "56px",
                  touchAction: "manipulation"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

