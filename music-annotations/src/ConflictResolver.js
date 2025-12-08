import React from "react";

export default function ConflictResolver({ conflicts, onResolve, onClose, currentUserProfile }) {
  // Helper function to determine if the current user can override an existing annotation
  const canOverride = (existingCreatorRole) => {
    if (!currentUserProfile || !existingCreatorRole) return true;
    
    // Teachers can override student annotations
    if (currentUserProfile.role === "teacher" && existingCreatorRole === "student") {
      return true;
    }
    
    // Students cannot override teacher annotations
    if (currentUserProfile.role === "student" && existingCreatorRole === "teacher") {
      return false;
    }
    
    // Same role: allow override (teacher-teacher or student-student)
    return true;
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "var(--dominant)",
          padding: 30,
          borderRadius: 8,
          maxWidth: 700,
          maxHeight: "85vh",
          overflow: "auto",
          border: "4px solid var(--accent-dark)"
        }}
      >
        <h2 style={{ marginTop: 0 }}>⚠️ Annotation Conflicts Detected</h2>
        <p style={{ fontSize: 16, marginBottom: 25 }}>
          Some annotations overlap with existing ones. Choose how to resolve each conflict:
        </p>
        {conflicts.map((conflict, i) => {
          const existingRole = conflict.existingCreator?.role;
          const canUserOverride = canOverride(existingRole);
          
          return (
            <div
              key={i}
              style={{
                marginBottom: 25,
                padding: 20,
                border: "3px solid var(--accent-dark)",
                borderRadius: 8,
                background: "var(--accent-pink)",
              }}
            >
              <h4 style={{ marginTop: 0 }}>Conflict {i + 1}</h4>
              {!canUserOverride && (
                <div
                  style={{
                    background: "var(--accent-dark)",
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: 5,
                    marginBottom: 10,
                    fontSize: 14,
                  }}
                >
                  ⚠️ You cannot override teacher annotations
                </div>
              )}
              <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <strong>Your New Annotation</strong>
                  <div style={{ marginTop: 5 }}>
                    Type: {conflict.newAnnotation.type}
                  </div>
                  <div>
                    Position: ({conflict.newAnnotation.x.toFixed(0)},{" "}
                    {conflict.newAnnotation.y.toFixed(0)})
                  </div>
                  {conflict.newAnnotation.color && (
                    <div>
                      Color:{" "}
                      <span
                        style={{
                          display: "inline-block",
                          width: 20,
                          height: 20,
                          background: conflict.newAnnotation.color,
                          border: "1px solid #000",
                        }}
                      />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <strong>Existing Annotation</strong>
                  <div style={{ marginTop: 5 }}>
                    Type: {conflict.existing.type}
                  </div>
                  <div>
                    Position: ({conflict.existing.x.toFixed(0)},{" "}
                    {conflict.existing.y.toFixed(0)})
                  </div>
                  {conflict.existing.color && (
                    <div>
                      Color:{" "}
                      <span
                        style={{
                          display: "inline-block",
                          width: 20,
                          height: 20,
                          background: conflict.existing.color,
                          border: "1px solid #000",
                        }}
                      />
                    </div>
                  )}
                  {conflict.existingCreator && (
                    <div>
                      By: {conflict.existingCreator.name} (
                      {conflict.existingCreator.role})
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: "15px", flexWrap: "wrap" }}>
                <button
                  onClick={() => onResolve(i, "keep-new")}
                  disabled={!canUserOverride}
                  style={{
                    flex: 1,
                    minWidth: "140px",
                    padding: "14px 20px",
                    background: canUserOverride ? "var(--secondary)" : "#ccc",
                    color: canUserOverride ? "var(--accent-dark)" : "#666",
                    cursor: canUserOverride ? "pointer" : "not-allowed",
                    opacity: canUserOverride ? 1 : 0.6,
                    fontSize: "18px",
                    minHeight: "50px",
                    borderRadius: "8px",
                    touchAction: "manipulation"
                  }}
                >
                  Keep Mine
                </button>
                <button
                  onClick={() => onResolve(i, "keep-existing")}
                  style={{
                    flex: 1,
                    minWidth: "140px",
                    padding: "14px 20px",
                    background: "var(--accent-mint)",
                    color: "var(--accent-dark)",
                    fontSize: "18px",
                    minHeight: "50px",
                    borderRadius: "8px",
                    touchAction: "manipulation"
                  }}
                >
                  Keep Existing
                </button>
                <button
                  onClick={() => onResolve(i, "keep-both")}
                  disabled={!canUserOverride}
                  style={{
                    flex: 1,
                    minWidth: "140px",
                    padding: "14px 20px",
                    background: canUserOverride ? "var(--accent-dark)" : "#ccc",
                    color: canUserOverride ? "white" : "#666",
                    cursor: canUserOverride ? "pointer" : "not-allowed",
                    opacity: canUserOverride ? 1 : 0.6,
                    fontSize: "18px",
                    minHeight: "50px",
                    borderRadius: "8px",
                    touchAction: "manipulation"
                  }}
                >
                  Keep Both
                </button>
              </div>
            </div>
          );
        })}
        <button
          onClick={onClose}
          style={{
            marginTop: 25,
            padding: "16px 24px",
            background: "var(--accent-pink)",
            color: "var(--accent-dark)",
            width: "100%",
            fontSize: "20px",
            minHeight: "56px",
            borderRadius: "8px",
            touchAction: "manipulation"
          }}
        >
          ✕ Cancel Save
        </button>
      </div>
    </div>
  );
}

