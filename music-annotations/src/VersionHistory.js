import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

export default function VersionHistory({ currentPieceId, onRevert, userRole }) {
  const [commits, setCommits] = useState([]);
  const [expandedCommits, setExpandedCommits] = useState(new Set());

  function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }

  const loadHistory = useCallback(async () => {
    // Fetch annotations for current piece
    const { data: annotationsData, error: annotationsError } = await supabase
      .from("annotations")
      .select("*")
      .eq("piece_id", currentPieceId)
      .order("created_at", { ascending: false });

    if (annotationsError) {
      console.error("Error loading annotations:", annotationsError);
      return;
    }

    if (annotationsData && annotationsData.length > 0) {
      // Fetch all profiles
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, name, role");

      // Create a map of user_id to profile
      const profilesMap = {};
      if (profilesData) {
        profilesData.forEach((p) => {
          profilesMap[p.user_id] = p;
        });
      }

      // Group by created_at timestamp (same batch save) and user
      const commitGroups = {};
      annotationsData.forEach((a) => {
        // Group by created_at rounded to the nearest second and user
        const commitKey = `${a.created_by}-${new Date(a.created_at).toISOString().split('.')[0]}`;
        if (!commitGroups[commitKey]) {
          commitGroups[commitKey] = {
            timestamp: a.created_at,
            user: profilesMap[a.created_by] || { name: "Unknown", role: "unknown" },
            userId: a.created_by,
            annotations: [],
          };
        }
        commitGroups[commitKey].annotations.push(a);
      });

      // Convert to array and sort by timestamp
      const commitsList = Object.values(commitGroups).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      setCommits(commitsList);
    }
  }, [currentPieceId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const toggleCommit = (index) => {
    const newExpanded = new Set(expandedCommits);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedCommits(newExpanded);
  };

  return (
    <div style={{ 
      marginTop: 20, 
      padding: 25, 
      background: "white", 
      border: "3px solid var(--accent-dark)", 
      borderRadius: 8 
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: 20,
        paddingBottom: 15,
        borderBottom: "2px solid var(--secondary)"
      }}>
        <h3 style={{ margin: 0 }}>📜 Version History</h3>
        <span style={{ fontSize: 14, color: "var(--accent-dark)" }}>
          {commits.length} version{commits.length !== 1 ? 's' : ''}
        </span>
      </div>

      {commits.length === 0 ? (
        <div style={{ 
          padding: 30, 
          background: "var(--accent-mint)", 
          borderRadius: 8, 
          border: "2px dashed var(--accent-dark)",
          textAlign: "center"
        }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            No versions yet
          </p>
          <p style={{ marginTop: 10, fontSize: 14, color: "var(--accent-dark)" }}>
            Add annotations and click "Apply All Changes" to save your first version!
          </p>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {commits.map((commit, i) => {
            const isExpanded = expandedCommits.has(i);
            const isLast = i === commits.length - 1;
            
            return (
              <div key={i} style={{ position: "relative", paddingLeft: 45, marginBottom: 15 }}>
                {/* Timeline line */}
                {!isLast && (
                  <div style={{
                    position: "absolute",
                    left: 12,
                    top: 30,
                    bottom: -15,
                    width: 2,
                    background: "var(--secondary)"
                  }} />
                )}
                
                {/* Version dot */}
                <div style={{
                  position: "absolute",
                  left: 6,
                  top: 8,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: commit.user.role === "teacher" ? "#ff6b6b" : "var(--accent-dark)",
                  border: "3px solid white",
                  boxShadow: "0 0 0 2px var(--accent-dark)"
                }} />

                {/* Version card */}
                <div style={{
                  border: "2px solid var(--accent-dark)",
                  borderRadius: 8,
                  background: "var(--dominant)",
                  overflow: "hidden"
                }}>
                  {/* Version header */}
                  <div 
                    onClick={() => toggleCommit(i)}
                    style={{
                      padding: "12px 15px",
                      background: "var(--accent-mint)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                        {commit.user.role === "teacher" && "🎓 "}
                        {commit.user.name} added {commit.annotations.length} annotation{commit.annotations.length !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--accent-dark)" }}>
                        {formatTimeAgo(commit.timestamp)} • {new Date(commit.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ 
                      fontSize: 18, 
                      color: "var(--accent-dark)",
                      transition: "transform 0.2s",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)"
                    }}>
                      ▼
                    </div>
                  </div>

                  {/* Version details (expandable) */}
                  {isExpanded && (
                    <div style={{ padding: 15 }}>
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", 
                        gap: 12 
                      }}>
                        {commit.annotations.map((a, j) => (
                          <div
                            key={j}
                            style={{
                              padding: 12,
                              border: "1px solid var(--accent-dark)",
                              borderRadius: 6,
                              background: "white",
                              fontSize: 13
                            }}
                          >
                            <div style={{ marginBottom: 6, fontWeight: 700, color: "var(--accent-dark)" }}>
                              {a.type === "dot" ? "● Dot" : "🖼️ Sticker"}
                            </div>
                            <div>Position: ({a.x.toFixed(0)}, {a.y.toFixed(0)})</div>
                            {a.color && (
                              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                Color:{" "}
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 16,
                                    height: 16,
                                    background: a.color,
                                    border: "1px solid #000",
                                    borderRadius: 3
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {/* Revert button - only show for teachers */}
                      {onRevert && userRole === 'teacher' && (
                        <div style={{ marginTop: 15, paddingTop: 15, borderTop: "2px solid var(--secondary)" }}>
                          <button
                            onClick={() => onRevert(commit.timestamp)}
                            style={{
                              padding: "10px 20px",
                              background: "#dc3545",
                              color: "white",
                              border: "none",
                              borderRadius: 5,
                              cursor: "pointer",
                              fontSize: 14,
                              fontWeight: 700,
                              fontFamily: "Gaegu, sans-serif"
                            }}
                          >
                            ⏪ Revert to This Version
                          </button>
                          <p style={{ marginTop: 8, fontSize: 12, color: "#666", fontStyle: "italic" }}>
                            This will delete all annotations created after this version.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


