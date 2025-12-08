import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
        },
      });
      if (error) {
        setError(error.message);
      } else if (data.user) {
        // Wait a moment for auth to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Insert profile (no global role - roles are per-piece now)
        const { error: profileError } = await supabase.from("profiles").insert({
          user_id: data.user.id,
          email: email,
          name: name,
        });
        
        if (profileError) {
          console.error("Profile creation error:", profileError);
          // Still show success but log the error
          alert("Signup successful! Profile will be created on first login. Please log in now.");
          setIsSignup(false);
          setEmail("");
          setPassword("");
          setName("");
        } else {
          alert("Signup successful! Please log in.");
          setIsSignup(false);
          setEmail("");
          setPassword("");
          setName("");
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        onLogin();
      }
    }
  }

  return (
    <div style={{ 
      maxWidth: 450, 
      margin: "50px auto", 
      padding: 30,
      background: "white",
      borderRadius: 8,
      border: "3px solid var(--accent-dark)"
    }}>
      <h2 style={{ textAlign: "center", marginTop: 0 }}>
        {isSignup ? "Sign Up" : "Log In"}
      </h2>
      <form onSubmit={handleSubmit}>
        {isSignup && (
          <div style={{ marginBottom: 15 }}>
            <label style={{ display: "block", marginBottom: 5 }}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>
        )}
        <div style={{ marginBottom: 15 }}>
          <label style={{ display: "block", marginBottom: 5 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 15 }}>
          <label style={{ display: "block", marginBottom: 5 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>
        {error && <p style={{ 
          color: "var(--accent-dark)", 
          background: "var(--accent-pink)", 
          padding: 10, 
          borderRadius: 5,
          fontWeight: 700
        }}>{error}</p>}
        <button
          type="submit"
          style={{
            width: "100%",
            padding: 12,
            background: "var(--accent-dark)",
            color: "white",
            marginTop: 10
          }}
        >
          {isSignup ? "Sign Up" : "Log In"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: 20, marginBottom: 0 }}>
        {isSignup ? "Already have an account? " : "Don't have an account? "}
        <button
          onClick={() => setIsSignup(!isSignup)}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent-dark)",
            cursor: "pointer",
            textDecoration: "underline",
            padding: 0,
            fontSize: "inherit"
          }}
        >
          {isSignup ? "Log In" : "Sign Up"}
        </button>
      </p>
    </div>
  );
}

