"use client";

import { useEffect, useState } from "react";
import axios from "axios";

const ACCESS_PASSWORD = "edfjorder";
const AUTH_STORAGE_KEY = "edfj-order-export-auth";

const stores = [
  { name: "EDFJ", value: "enchanted-jewelry-dev" },
  { name: "SWFJ", value: "starwars-dev" },
  { name: "EDFJ-UK", value: "enchanted-jewelry-uk" },
];

export default function OrderExport() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [store, setStore] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportWithProperties, setExportWithProperties] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAuthenticated(sessionStorage.getItem(AUTH_STORAGE_KEY) === "true");
    setAuthChecked(true);
  }, []);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === ACCESS_PASSWORD) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
      setAuthenticated(true);
      setPasswordError("");
      setPassword("");
      return;
    }
    setPasswordError("Incorrect password. Please try again.");
  };

  const handleDownload = async () => {
    if (!store || !startDate || !endDate) {
      setError("Please select a store and both Start and End dates.");
      return;
    }

    setLoading(true);
    setError("");

    const payload = { store, startDate, endDate, exportWithLineItemProperties: exportWithProperties };

    try {
      const response = await axios.post("/api/orders", payload, {
        headers: { "Content-Type": "application/json" },
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${store}_orders.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading CSV:", err);
      let message = "Failed to fetch order data.";
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.error) message = json.error;
          else if (json.message) message = json.message;
        } catch (_) {}
      } else if (err.response?.data?.error) {
        message = err.response.data.error;
      } else if (err.response?.data?.message) {
        message = err.response.data.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) {
    return <div className="page-container" />;
  }

  if (!authenticated) {
    return (
      <div className="page-container">
        <div className="card">
          <h2>Order Export Access</h2>
          <form onSubmit={handlePasswordSubmit}>
            <div className="input-group">
              <label htmlFor="access-password">Password:</label>
              <input
                id="access-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="download-btn">
              Continue
            </button>
            {passwordError && <p className="error-message">{passwordError}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="card">
        {loading && (
          <div className="loading-overlay" aria-live="polite" aria-busy="true">
            <div className="spinner" />
            <p>Generating report…</p>
          </div>
        )}

        <h2>Shopify Order Export</h2>

        <div className="input-group">
          <label>Select Store:</label>
          <select
            value={store}
            onChange={(e) => setStore(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Select Store --</option>
            {stores.map((s) => (
              <option key={s.value} value={s.value}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label>Start Date:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="input-group">
          <label>End Date:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="input-group input-group-checkbox">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={exportWithProperties}
              onChange={(e) => setExportWithProperties(e.target.checked)}
              disabled={loading}
            />
            &nbsp;Export order with line item properties
          </label>
        </div>

        {loading && (
          <div className="progress-bar" aria-hidden="true">
            <div className="progress-bar-fill" />
          </div>
        )}

        <button
          className="download-btn"
          onClick={handleDownload}
          disabled={loading}
        >
          {loading ? "Downloading..." : "Download Order CSV"}
        </button>

        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}
