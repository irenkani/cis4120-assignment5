import React, { useRef, useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf";
GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;


export default function AnnotationCanvas({ annotations, addAnnotation, user, profile, deleteAnnotation, currentPieceId }) {
  const canvasRef = useRef(null);
  const [color, setColor] = useState("red");
  const [mode, setMode] = useState("dot");
  const [filterBy, setFilterBy] = useState("all");
  const [sheetMusicUrl, setSheetMusicUrl] = useState(null);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const SHEET_BUCKET = "sheet-music";
  const STICKER_BUCKET = "stickers";

  // Draw sheet music on canvas when it loads
  useEffect(() => {
    if (!sheetMusicUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const isPdf = /\.pdf($|\?)/i.test(sheetMusicUrl);

    if (!isPdf) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = sheetMusicUrl;
      return;
    }

    (async () => {
    try {
      const pdf = await getDocument(sheetMusicUrl).promise;
      const page = await pdf.getPage(1); 
      const unscaled = page.getViewport({ scale: 1 });
      const scale = canvas.width / unscaled.width;
      const viewport = page.getViewport({ scale });
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error("PDF render error:", err);
      alert("Could not render the PDF. Try a PNG/JPG for now, or check console.");
    }
    })();
  }, [sheetMusicUrl]);

  const handleClick = (e) => {
    if (mode !== "dot" || isDeleteMode) return; // Don't add annotations in delete mode
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addAnnotation({ x, y, color, type: "dot", sticker_url: null, piece_id: currentPieceId });
  };

  async function handleSheetMusicUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop().toLowerCase();
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase
    .storage
    .from(SHEET_BUCKET) 
    .upload(path, file, { upsert: true, contentType: file.type });

    if (error) {
      console.error("UPLOAD ERROR", error);
      alert("Upload failed: " + error.message);
      return;
    }

    const { data: urlData } = supabase.storage.from(SHEET_BUCKET).getPublicUrl(path);
    setSheetMusicUrl(urlData.publicUrl);
    alert("Sheet music uploaded successfully!");
  }
  
  async function handleStickerUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = `${user.id}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("stickers").upload(fileName, file);
    if (error) {
      alert("Upload failed: " + error.message);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("stickers")
      .getPublicUrl(fileName);

    const x = 100;
    const y = 100;
    addAnnotation({ x, y, color: null, type: "sticker", sticker_url: urlData.publicUrl, piece_id: currentPieceId });
    alert("Sticker uploaded! It will appear on the canvas.");
  }

  const filteredAnnotations = annotations.filter((a) => {
    if (filterBy === "all") return true;
    if (filterBy === "mine") return a.created_by === user.id;
    if (filterBy === "others") return a.created_by !== user.id;
    return true;
  });

  const handleAnnotationClick = (annotation, e) => {
    e.stopPropagation(); // Prevent canvas click from firing
    
    // Only handle delete if in delete mode
    if (!isDeleteMode) return;
    
    const isMine = annotation.created_by === user.id;
    const isTeacher = profile?.role === "teacher";
    
    // Teachers can delete all annotations, students can only delete their own
    if (isTeacher || isMine) {
      deleteAnnotation(annotation);
    } else {
      alert("You can only delete your own annotations.");
    }
  };

  
  return (
    <div>
      <div style={{ 
        marginBottom: 20, 
        padding: 20, 
        background: "white", 
        borderRadius: 8,
        border: "2px solid var(--accent-dark)"
      }}>
        <label style={{ fontSize: 18, marginRight: 10 }}>📄 Sheet Music</label>
        <input 
          type="file" 
          accept="image/*,application/pdf" 
          onChange={handleSheetMusicUpload}
          style={{ fontSize: 14 }}
        />
        {sheetMusicUrl && <span style={{ marginLeft: 10, color: "var(--secondary)", fontWeight: 700 }}>✓ Loaded</span>}
        {!sheetMusicUrl && <span style={{ marginLeft: 10, color: "var(--accent-dark)" }}>(No sheet music loaded)</span>}
      </div>
      {isDeleteMode && (
        <div style={{
          marginBottom: 15,
          padding: 15,
          background: "#ff6b6b",
          color: "white",
          borderRadius: 8,
          border: "2px solid #c92a2a",
          fontWeight: 700,
          textAlign: "center",
          fontSize: 16
        }}>
          🗑️ DELETE MODE ACTIVE - Click any annotation to delete it (Click "Exit Delete Mode" to return to normal mode)
        </div>
      )}
      <div style={{ 
        marginBottom: 20, 
        padding: 20, 
        background: "var(--accent-mint)", 
        borderRadius: 8,
        border: "2px solid var(--accent-dark)",
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        <div>
          <label style={{ marginRight: 10 }}>Mode</label>
          <select 
            onChange={(e) => {
              setMode(e.target.value);
              setIsDeleteMode(false); // Exit delete mode when changing modes
            }} 
            value={mode}
            disabled={isDeleteMode}
          >
            <option value="dot">Draw Dots</option>
            <option value="sticker">Upload Sticker</option>
          </select>
        </div>
        <div>
          <button
            onClick={() => setIsDeleteMode(!isDeleteMode)}
            style={{
              padding: "8px 16px",
              background: isDeleteMode ? "#ff6b6b" : "var(--accent-dark)",
              color: "white",
              fontSize: 14,
              fontWeight: 700,
              border: "2px solid var(--accent-dark)",
              borderRadius: 5,
              cursor: "pointer"
            }}
          >
            {isDeleteMode ? "✓ Exit Delete Mode" : "🗑️ Delete Mode"}
          </button>
        </div>
        <div>
          <label style={{ marginRight: 10 }}>Show</label>
          <select onChange={(e) => setFilterBy(e.target.value)} value={filterBy}>
            <option value="all">All Annotations</option>
            <option value="mine">My Annotations</option>
            <option value="others">Others' Annotations</option>
          </select>
        </div>
        {mode === "dot" && !isDeleteMode && (
          <div>
            <label style={{ marginRight: 10 }}>Color</label>
            <select onChange={(e) => setColor(e.target.value)} value={color}>
              <option value="red">Red</option>
              <option value="blue">Blue</option>
              <option value="green">Green</option>
            </select>
          </div>
        )}
        {mode === "sticker" && !isDeleteMode && (
          <div>
            <label style={{ marginRight: 10 }}>Upload Sticker</label>
            <input type="file" accept="image/*" onChange={handleStickerUpload} />
          </div>
        )}
      </div>
      <div style={{ position: "relative", display: "inline-block" }}>
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          width={600}
          height={600}
          style={{ 
            border: "1px solid #ccc", 
            marginTop: "10px", 
            background: sheetMusicUrl ? "transparent" : "white", 
            cursor: isDeleteMode ? "not-allowed" : (mode === "dot" ? "crosshair" : "default")
          }}
        />
        {filteredAnnotations.map((a, i) => {
          const isMine = a.created_by === user.id;
          const isTeacher = profile?.role === "teacher";
          const canDelete = isTeacher || isMine;
          const border = isMine ? "2px solid blue" : "2px solid orange";
          
          // In delete mode, make annotations clickable; otherwise make them click-through
          const pointerEvents = isDeleteMode ? "auto" : "none";
          const hoverHint = isDeleteMode
            ? (canDelete ? "Click to delete" : "You cannot delete this annotation")
            : "Annotation (Enter delete mode to remove)";
          const cursorStyle = isDeleteMode 
            ? (canDelete ? "pointer" : "not-allowed")
            : "crosshair";
          
          if (a.type === "sticker" && a.sticker_url) {
            return (
              <div
                key={i}
                onClick={(e) => handleAnnotationClick(a, e)}
                style={{
                  position: "absolute",
                  left: a.x,
                  top: a.y,
                  pointerEvents: pointerEvents,
                  cursor: cursorStyle,
                }}
                title={hoverHint}
              >
                <img
                  src={a.sticker_url}
                  alt="sticker"
                  style={{
                    width: 50,
                    height: 50,
                    border: border,
                    borderRadius: 5,
                    pointerEvents: "none", // Let parent div handle clicks
                  }}
                />
              </div>
            );
          } else if (a.type === "dot") {
            return (
              <div
                key={i}
                onClick={(e) => handleAnnotationClick(a, e)}
                style={{
                  position: "absolute",
                  left: a.x - 5,
                  top: a.y - 5,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: a.color,
                  border: isMine ? "2px solid blue" : "2px solid orange",
                  boxShadow: "0 0 3px rgba(0,0,0,0.3)",
                  pointerEvents: pointerEvents,
                  cursor: cursorStyle,
                }}
                title={hoverHint}
              />
            );
          }
          return null;
        })}
      </div>
      <div style={{ 
        marginTop: 20, 
        padding: 20, 
        background: "var(--secondary)", 
        borderRadius: 8, 
        border: "2px solid var(--accent-dark)"
      }}>
        <h4 style={{ marginTop: 0, marginBottom: 15 }}>Legend</h4>
        <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 18, height: 18, background: "blue", border: "2px solid blue", borderRadius: "50%" }} />
            <span>Your annotations</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 18, height: 18, background: "orange", border: "2px solid orange", borderRadius: "50%" }} />
            <span>Others' annotations</span>
          </div>
        </div>
        {profile?.role === "teacher" && (
          <div style={{ 
            marginTop: 15, 
            padding: 12, 
            background: "var(--accent-pink)", 
            borderRadius: 5,
            color: "var(--accent-dark)", 
            fontWeight: 700 
          }}>
            🎓 TEACHER MODE: You can delete all annotations and override student annotations
          </div>
        )}
      </div>
    </div>
  );
}
