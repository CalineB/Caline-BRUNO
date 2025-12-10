// src/pages/KYC.jsx
import React, { useState, useMemo } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { keccak256, toUtf8Bytes } from "ethers";
import { CONTRACTS } from "../config/contracts.js";

import KYCRequestJSON from "../abis/KYCRequestRegistry.json";
import IdentityJSON from "../abis/IdentityRegistry.json";

const KYCRequestABI = KYCRequestJSON.abi;
const IdentityABI = IdentityJSON.abi;

export default function KYC() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    street: "",
    city: "",
    country: "",
  });

  const [idFile, setIdFile] = useState(null);
  const [proofFile, setProofFile] = useState(null);

  const [txHash, setTxHash] = useState(null);
  const [hashPreview, setHashPreview] = useState(null);

  // =====================================================
  // 1) Lecture KYC côté blockchain
  // =====================================================

  const { data: rawKycRequest } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCRequestABI,
    functionName: "requests",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
    },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
    },
  });

  // Normalisation des champs de la struct Request
  const { exists, approved, rejected, kycHashOnChain } = useMemo(() => {
    if (!rawKycRequest) {
      return {
        exists: false,
        approved: false,
        rejected: false,
        kycHashOnChain: null,
      };
    }

    // viem retourne un objet struct { 0,1,2,3, kycHash, exists, approved, rejected }
    const r = rawKycRequest;

    const kycHash =
      r.kycHash ??
      r[0] ??
      null;

    const ex =
      typeof r.exists === "boolean"
        ? r.exists
        : typeof r[1] === "boolean"
        ? r[1]
        : false;

    const ap =
      typeof r.approved === "boolean"
        ? r.approved
        : typeof r[2] === "boolean"
        ? r[2]
        : false;

    const rej =
      typeof r.rejected === "boolean"
        ? r.rejected
        : typeof r[3] === "boolean"
        ? r[3]
        : false;

    return {
      exists: ex,
      approved: ap,
      rejected: rej,
      kycHashOnChain: kycHash,
    };
  }, [rawKycRequest]);

  // =====================================================
  // 2) Gestion du formulaire
  // =====================================================

  function updateField(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleIdFile(e) {
    const f = e.target.files?.[0] || null;
    setIdFile(f);
  }

  function handleProofFile(e) {
    const f = e.target.files?.[0] || null;
    setProofFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isConnected || !address) {
      alert("Connecte ton wallet d'abord via le bouton en haut.");
      return;
    }

    // On empêche une nouvelle soumission si la demande existe déjà et n'est pas rejetée
    if (exists && !rejected) {
      alert("Tu as déjà une demande KYC en cours ou approuvée.");
      return;
    }

    if (!idFile || !proofFile) {
      alert(
        "Merci d'importer ta pièce d'identité et ton justificatif de domicile."
      );
      return;
    }

    const payload = {
      ...form,
      wallet: address,
    };

    const json = JSON.stringify(payload);
    const hash = keccak256(toUtf8Bytes(json));
    setHashPreview(hash);

    try {
      const tx = await writeContract({
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCRequestABI,
        functionName: "submitKYC",
        args: [hash],
        // tu peux laisser wagmi estimer le gas tout seul, pas besoin de le forcer
      });

      const txHashFinal = typeof tx === "string" ? tx : tx?.hash ?? null;
      setTxHash(txHashFinal);

      alert(
        "Demande KYC envoyée sur la blockchain. Elle est en cours d'examen."
      );
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur lors de l'envoi du KYC");
    }
  }

  // =====================================================
  // 3) Statut lisible
  // =====================================================

  let kycStatusLabel = "Aucune demande KYC trouvée pour ce wallet.";
  if (exists) {
    if (approved && !rejected) {
      if (isVerified) {
        kycStatusLabel =
          "✅ KYC validé et wallet whiteliste. Tu peux investir.";
      } else {
        kycStatusLabel =
          "✅ KYC approuvé, en attente de mise à jour du wallet (whitelisting).";
      }
    } else if (!approved && !rejected) {
      kycStatusLabel = "⏳ KYC en cours de traitement par l'équipe conformité.";
    } else if (rejected) {
      kycStatusLabel =
        "❌ KYC refusé. Tu peux éventuellement soumettre une nouvelle demande mise à jour.";
    }
  }

  // Formulaire visible seulement si :
  // - aucune demande (exists = false)
  // - OU demande rejetée (rejected = true)
  const canShowForm = !exists || rejected;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <h1>Formulaire KYC</h1>
      <p>
        Ces informations seront utilisées pour vérifier ton identité
        (conformité PSFP). Une fois validé par l&apos;équipe conformité,
        ton wallet sera autorisé à investir.
      </p>

      <div
        style={{
          margin: "1rem 0",
          padding: "0.75rem",
          background: "#f5f5f5",
          borderRadius: 8,
        }}
      >
        <p>
          <strong>Wallet connecté :</strong>{" "}
          {address ? <code>{address}</code> : "—"}
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          <strong>Statut KYC :</strong>
          <br />
          {kycStatusLabel}
        </p>
        {kycHashOnChain && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
            Hash KYC stocké on-chain :<br />
            <code>{kycHashOnChain}</code>
          </p>
        )}
      </div>

      {!isConnected && (
        <p style={{ color: "red", marginBottom: "1rem" }}>
          ⚠️ Tu dois d&apos;abord connecter ton wallet (bouton &quot;Se
          connecter&quot; en haut).
        </p>
      )}

      {canShowForm ? (
        <form onSubmit={handleSubmit}>
          <div>
            <label>Prénom</label>
            <input
              name="firstname"
              value={form.firstname}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Nom</label>
            <input
              name="lastname"
              value={form.lastname}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Adresse</label>
            <input
              name="street"
              value={form.street}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Ville</label>
            <input
              name="city"
              value={form.city}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Pays</label>
            <input
              name="country"
              value={form.country}
              onChange={updateField}
              required
            />
          </div>

          <hr style={{ margin: "1.5rem 0" }} />

          <h2>Pièces justificatives</h2>

          <div style={{ marginBottom: "1rem" }}>
            <label>Carte d&apos;identité (image ou PDF)</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleIdFile}
              required
            />
            {idFile && <p>Fichier sélectionné : {idFile.name}</p>}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Justificatif de domicile (image ou PDF)</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleProofFile}
              required
            />
            {proofFile && <p>Fichier sélectionné : {proofFile.name}</p>}
          </div>

          <button type="submit" disabled={isPending || !isConnected}>
            {isPending ? "Transaction en cours..." : "Envoyer mon KYC"}
          </button>
        </form>
      ) : (
        <p style={{ marginTop: "1rem" }}>
          Tu ne peux plus modifier le formulaire tant que cette demande n&apos;est
          pas rejetée. Contacte l&apos;équipe conformité si nécessaire.
        </p>
      )}

      {hashPreview && (
        <p
          style={{
            marginTop: "1rem",
            fontSize: "0.85rem",
            color: "#555",
            wordBreak: "break-all",
          }}
        >
          Hash KYC (infos texte + wallet) calculé localement :<br />
          <code>{hashPreview}</code>
        </p>
      )}

      {txHash && (
        <p
          style={{
            marginTop: "1rem",
            fontSize: "0.85rem",
            wordBreak: "break-all",
          }}
        >
          Transaction envoyée (testnet) :<br />
          <code>{txHash}</code>
        </p>
      )}
    </div>
  );
}
