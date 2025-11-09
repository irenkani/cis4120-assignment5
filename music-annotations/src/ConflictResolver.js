import React from "react";

export default function ConflictResolver({ conflicts, onResolve, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "white",
          padding: 30,
          borderRadius: 10,
          maxWidth: 600,
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <h2>Annotation Conflicts Detected</h2>
        <p>
          Some annotations overlap with existing ones. Choose how to resolve
          each conflict:
        </p>
        {conflicts.map((conflict, i) => (
          <div
            key={i}
            style={{
              marginBottom: 20,
              padding: 15,
              border: "2px solid #ff9800",
              borderRadius: 5,
              background: "#fff3e0",
            }}
          >
            <h4>Conflict {i + 1}</h4>
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
            <div style={{ marginTop: 15, display: "flex", gap: 10 }}>
              <button
                onClick={() => onResolve(i, "keep-new")}
                style={{
                  flex: 1,
                  padding: "8px 15px",
                  background: "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                }}
              >
                Keep Mine
              </button>
              <button
                onClick={() => onResolve(i, "keep-existing")}
                style={{
                  flex: 1,
                  padding: "8px 15px",
                  background: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                }}
              >
                Keep Existing
              </button>
              <button
                onClick={() => onResolve(i, "keep-both")}
                style={{
                  flex: 1,
                  padding: "8px 15px",
                  background: "#ff9800",
                  color: "white",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                }}
              >
                Keep Both
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            padding: "10px 20px",
            background: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: 5,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Cancel Save
        </button>
      </div>
    </div>
  );
}

