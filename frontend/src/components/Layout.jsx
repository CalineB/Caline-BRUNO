// src/components/Layout.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

function shorten(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function Layout({ children }) {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const injectedConnector = connectors.find((c) => c.id === "injected") || connectors[0];

  const onConnect = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect({ connector: injectedConnector });
    }
  };

  return (
    <div className="app">
      <header className="header" style={{ padding: "1rem", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Link to="/" style={{ textDecoration: "none", fontWeight: "bold", fontSize: "1.2rem" }}>
            🏠 RealEstate PSFP
          </Link>
          <nav style={{ marginTop: "0.5rem" }}>
            <Link to="/market" style={{ marginRight: "1rem" }}>Biens</Link>
            <Link to="/kyc" style={{ marginRight: "1rem" }}>KYC</Link>
            <Link to="/dashboard" style={{ marginRight: "1rem" }}>Mon espace</Link>
            <Link to="/admin">Admin</Link>
          </nav>
        </div>

        <div>
          {isConnected && (
            <span style={{ marginRight: "1rem", fontFamily: "monospace" }}>
              {shorten(address)}
            </span>
          )}
          <button onClick={onConnect}>
            {isConnected ? "Se déconnecter" : isPending ? "Connexion..." : "Se connecter"}
          </button>
        </div>
      </header>

      <main style={{ padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
