import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import AnnotationCanvas from "./AnnotationCanvas";

export default function App() {
  const [annotations, setAnnotations] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadAnnotations();
  }, []);

  async function loadAnnotations() {
    const { data, error } = await supabase.from("annotations").select("*");
    if (error) console.error(error);
    else setAnnotations(data);
  }

  const addAnnotation = (a) => {
    setAnnotations((prev) => [...prev, a]);
    setSaved(false);
  };

  async function saveAnnotations() {
    const newOnes = annotations.filter((a) => !a.id);
    if (newOnes.length === 0) return alert("No new annotations to save!");
    const { error } = await supabase.from("annotations").insert(newOnes);
    if (error) console.error(error);
    else setSaved(true);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Sheet Music Annotations</h1>
      <AnnotationCanvas annotations={annotations} addAnnotation={addAnnotation} />
      <button
        onClick={saveAnnotations}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: saved ? "#4caf50" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: 5,
        }}
      >
        {saved ? "Changes Saved!" : "Apply All Changes"}
      </button>
    </div>
  );
}
