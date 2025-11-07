import React, { useRef, useState } from "react";

export default function AnnotationCanvas({ annotations, addAnnotation }) {
  const canvasRef = useRef(null);
  const [color, setColor] = useState("red");

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addAnnotation({ x, y, color, type: "dot", sticker_url: null });
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div>
        <label>Color: </label>
        <select onChange={(e) => setColor(e.target.value)}>
          <option value="red">Red</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
        </select>
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        width={400}
        height={400}
        style={{ border: "1px solid #ccc", marginTop: "10px" }}
      />
      <div>
        {annotations.map((a, i) => (
          <div key={i} style={{ color: a.color }}>
            ({a.x.toFixed(0)}, {a.y.toFixed(0)})
          </div>
        ))}
      </div>
    </div>
  );
}
