import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt, simulateContract } from "wagmi/actions";
import { keccak256, toBytes } from "viem";

import { config } from "../web3/wagmiConfig.js";
import { CONTRACTS } from "../config/contracts.js";

import KYCJSON from "../abis/KYCRequestRegistry.json";
import IdentityJSON from "../abis/IdentityRegistry.json";

const KYCABI = KYCJSON.abi;
const IdentityABI = IdentityJSON.abi;

const ZERO = "0x0000000000000000000000000000000000000000";
const SEPOLIA_ID = 11155111;

// ✅ Liste pays (nationalité + résidence fiscale + pays adresse)
const COUNTRIES = [
  "France",
  "Afghanistan",
  "Afrique du Sud",
  "Albanie",
  "Algérie",
  "Allemagne",
  "Andorre",
  "Angola",
  "Arabie saoudite",
  "Argentine",
  "Arménie",
  "Australie",
  "Autriche",
  "Azerbaïdjan",
  "Bahamas",
  "Bahreïn",
  "Bangladesh",
  "Barbade",
  "Belgique",
  "Belize",
  "Bénin",
  "Bhoutan",
  "Biélorussie",
  "Bolivie",
  "Bosnie-Herzégovine",
  "Botswana",
  "Brésil",
  "Brunei",
  "Bulgarie",
  "Burkina Faso",
  "Burundi",
  "Cambodge",
  "Cameroun",
  "Canada",
  "Cap-Vert",
  "Chili",
  "Chine",
  "Chypre",
  "Colombie",
  "Comores",
  "Congo",
  "Corée du Sud",
  "Costa Rica",
  "Côte d’Ivoire",
  "Croatie",
  "Cuba",
  "Danemark",
  "Djibouti",
  "Dominique",
  "Égypte",
  "Émirats arabes unis",
  "Équateur",
  "Érythrée",
  "Espagne",
  "Estonie",
  "Eswatini",
  "États-Unis",
  "Éthiopie",
  "Fidji",
  "Finlande",
  "Gabon",
  "Gambie",
  "Géorgie",
  "Ghana",
  "Grèce",
  "Grenade",
  "Guatemala",
  "Guinée",
  "Guinée-Bissau",
  "Guinée équatoriale",
  "Guyana",
  "Haïti",
  "Honduras",
  "Hongrie",
  "Inde",
  "Indonésie",
  "Irak",
  "Iran",
  "Irlande",
  "Islande",
  "Israël",
  "Italie",
  "Jamaïque",
  "Japon",
  "Jordanie",
  "Kazakhstan",
  "Kenya",
  "Kirghizistan",
  "Kiribati",
  "Koweït",
  "Laos",
  "Lesotho",
  "Lettonie",
  "Liban",
  "Liberia",
  "Libye",
  "Liechtenstein",
  "Lituanie",
  "Luxembourg",
  "Macédoine du Nord",
  "Madagascar",
  "Malaisie",
  "Malawi",
  "Maldives",
  "Mali",
  "Malte",
  "Maroc",
  "Maurice",
  "Mauritanie",
  "Mexique",
  "Moldavie",
  "Monaco",
  "Mongolie",
  "Monténégro",
  "Mozambique",
  "Myanmar",
  "Namibie",
  "Népal",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "Norvège",
  "Nouvelle-Zélande",
  "Oman",
  "Ouganda",
  "Ouzbékistan",
  "Pakistan",
  "Panama",
  "Papouasie-Nouvelle-Guinée",
  "Paraguay",
  "Pays-Bas",
  "Pérou",
  "Philippines",
  "Pologne",
  "Portugal",
  "Qatar",
  "République centrafricaine",
  "République dominicaine",
  "République tchèque",
  "Roumanie",
  "Royaume-Uni",
  "Russie",
  "Rwanda",
  "Saint-Marin",
  "Salvador",
  "Sénégal",
  "Serbie",
  "Seychelles",
  "Sierra Leone",
  "Singapour",
  "Slovaquie",
  "Slovénie",
  "Somalie",
  "Soudan",
  "Sri Lanka",
  "Suède",
  "Suisse",
  "Suriname",
  "Syrie",
  "Tadjikistan",
  "Tanzanie",
  "Tchad",
  "Thaïlande",
  "Togo",
  "Trinité-et-Tobago",
  "Tunisie",
  "Turquie",
  "Ukraine",
  "Uruguay",
  "Venezuela",
  "Vietnam",
  "Yémen",
  "Zambie",
  "Zimbabwe",
];

// ✅ DOM/COM sous juridiction FR (s'affiche seulement si pays d'adresse = France)
const FRENCH_OVERSEAS = [
  "France Métropolitaine",
  "Guadeloupe (971)",
  "Martinique (972)",
  "Guyane (973)",
  "La Réunion (974)",
  "Mayotte (976)",
  "Saint-Barthélemy (977)",
  "Saint-Martin (978)",
  "Saint-Pierre-et-Miquelon (975)",
  "Polynésie française",
  "Nouvelle-Calédonie",
  "Wallis-et-Futuna",
  "Terres australes et antarctiques françaises (TAAF)",
];

function isValidAddress(a) {
  return typeof a === "string" && a.startsWith("0x") && a.length === 42;
}

function loadKycLocal(wallet) {
  if (!wallet) return null;
  try {
    const all = JSON.parse(localStorage.getItem("kycForms") || "{}");
    return all[wallet.toLowerCase()] || null;
  } catch {
    return null;
  }
}

function saveKycLocal(wallet, form) {
  if (!wallet) return;
  try {
    const all = JSON.parse(localStorage.getItem("kycForms") || "{}");
    all[wallet.toLowerCase()] = { wallet, form, updatedAt: Date.now() };
    localStorage.setItem("kycForms", JSON.stringify(all));
  } catch {
    // ignore
  }
}

function computeDocumentHash({ wallet, form, fileMeta }) {
  // Hash stable : uniquement texte + métadonnées fichiers (PAS de dataUrl)
  const payload = {
    wallet: wallet?.toLowerCase(),
    form: {
      firstname: form.firstname?.trim() || "",
      lastname: form.lastname?.trim() || "",
      birthDate: form.birthDate || "",
      nationality: form.nationality || "",
      taxCountry: form.taxCountry || "",
      street: form.street?.trim() || "",
      city: form.city?.trim() || "",
      country: form.country || "",
      addressRegionFR: form.addressRegionFR || "", // ✅ uniquement si country=France
    },
    fileMeta: fileMeta || { idDoc: null, proofOfAddress: null, taxNotice: null },
    version: 3,
  };

  return keccak256(toBytes(JSON.stringify(payload)));
}

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  const hadBirthdayThisYear = now >= new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  return now.getFullYear() - birth.getFullYear() - (hadBirthdayThisYear ? 0 : 1);
}

export default function KYC() {
  const { address, isConnected, chain } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const wallet = address || "";
  const [txHash, setTxHash] = useState(null);

  const savedLocal = useMemo(() => loadKycLocal(wallet), [wallet]);

  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    birthDate: "",
    nationality: "France",
    taxCountry: "France",
    street: "",
    city: "",
    country: "France",
    addressRegionFR: "", // ✅ seulement si country=France
  });

  const [files, setFiles] = useState({
    idDoc: null,
    proofOfAddress: null,
    taxNotice: null,
  });

  useEffect(() => {
    if (!savedLocal?.form) return;
    setForm((prev) => ({ ...prev, ...savedLocal.form }));
  }, [savedLocal]);

  // on-chain reads
  const { data: req } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCABI,
    functionName: "requests",
    args: isConnected && isValidAddress(wallet) ? [wallet] : undefined,
    query: { enabled: isConnected && isValidAddress(wallet) },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: isConnected && isValidAddress(wallet) ? [wallet] : undefined,
    query: { enabled: isConnected && isValidAddress(wallet) },
  });

  const onchain = useMemo(() => {
    let kycHash = null;
    let exists = false;
    let approved = false;
    let rejected = false;

    if (Array.isArray(req) && req.length >= 4) {
      kycHash = req[0];
      exists = !!req[1];
      approved = !!req[2];
      rejected = !!req[3];
    }

    return { exists, approved, rejected, isVerified: Boolean(isVerified), kycHash };
  }, [req, isVerified]);

  const hasLocal = Boolean(savedLocal?.form);

  function updateField(e) {
    const { name, value } = e.target;

    // si on quitte France en pays d’adresse, on clear le champ DOM/COM
    if (name === "country" && value !== "France") {
      setForm((p) => ({ ...p, country: value, addressRegionFR: "" }));
      return;
    }

    setForm((p) => ({ ...p, [name]: value }));
  }

  async function handleFileChange(key, file) {
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      alert("Fichier trop lourd (> 2.5MB). Compresse puis réessaie.");
      return;
    }
    // UI only: store metadata only
    setFiles((p) => ({
      ...p,
      [key]: { name: file.name, type: file.type, size: file.size },
    }));
  }

  function validateLocal() {
    const age = calcAge(form.birthDate);
    if (age === null) return "Date de naissance invalide.";
    if (age < 18) return "Tu dois avoir 18 ans minimum.";
    if (!form.firstname?.trim() || !form.lastname?.trim()) return "Nom/Prénom requis.";
    if (!form.street?.trim() || !form.city?.trim()) return "Adresse requise.";

    if (form.country === "France" && !form.addressRegionFR) {
      return "Si ton pays d’adresse est France, choisis aussi France Métropolitaine ou un DOM/COM.";
    }

    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTxHash(null);

    if (!isConnected) return alert("Connecte ton wallet d’abord.");
    if (chain?.id !== SEPOLIA_ID) return alert("⚠️ Change de réseau : Sepolia requis.");

    // ✅ pas de re-soumission côté user (contrat = 1 seule soumission)
    if (onchain.exists) {
      return alert(
        "Tu as déjà soumis une demande KYC.\n" +
          "Pour modifier, contacte l’administration."
      );
    }

    const err = validateLocal();
    if (err) return alert(err);

    if (!files.idDoc || !files.proofOfAddress) {
      return alert("Merci d’uploader au minimum : pièce d’identité + justificatif de domicile.");
    }

    const fileMeta = {
      idDoc: files.idDoc ? { name: files.idDoc.name, type: files.idDoc.type, size: files.idDoc.size } : null,
      proofOfAddress: files.proofOfAddress ? { name: files.proofOfAddress.name, type: files.proofOfAddress.type, size: files.proofOfAddress.size } : null,
      taxNotice: files.taxNotice ? { name: files.taxNotice.name, type: files.taxNotice.type, size: files.taxNotice.size } : null,
    };

    const documentHash = computeDocumentHash({ wallet, form, fileMeta });

    try {
      // local : ONLY text form (for re-display)
      saveKycLocal(wallet, form);

      // simulate to avoid "will probably fail"
      await simulateContract(config, {
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCABI,
        functionName: "submitKYC",
        args: [documentHash],
        account: wallet,
      });

      const hash = await writeContractAsync({
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCABI,
        functionName: "submitKYC",
        args: [documentHash],
      });

      setTxHash(hash);
      await waitForTransactionReceipt(config, { hash });

      alert("✅ KYC soumis on-chain (preuve = hash de transaction).");
    } catch (e2) {
      console.error(e2);
      alert(e2?.shortMessage || e2?.message || "Erreur submit KYC");
    }
  }

  if (!isConnected) {
    return (
      <div className="container">
        <h1>KYC</h1>
        <p className="muted">Connecte ton wallet pour soumettre ton KYC.</p>
      </div>
    );
  }

  const age = calcAge(form.birthDate);

  const fileInputStyle = {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.16)",
    background: "rgba(0,0,0,.25)",
    color: "rgba(255,255,255,.92)",
    fontFamily: "var(--font2)",
  };

  return (
    <div className="container">
      <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>KYC</h1>
          <p className="muted" style={{ margin: 0 }}>
            Wallet : <code>{wallet}</code>
          </p>
          {chain?.name && (
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Réseau : <strong>{chain.name}</strong> {chain?.id ? <span className="muted">(id {chain.id})</span> : null}
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__body">
          <h3 style={{ marginTop: 0 }}>Statut on-chain</h3>

          <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className={`badge ${onchain.exists ? "badge--ok" : "badge--warn"}`}>
              {onchain.exists ? "Demande existante" : "Aucune demande"}
            </span>
            <span className={`badge ${onchain.approved ? "badge--ok" : "badge--warn"}`}>
              {onchain.approved ? "Approuvé" : "Non approuvé"}
            </span>
            <span className={`badge ${onchain.rejected ? "badge--danger" : "badge--neutral"}`}>
              {onchain.rejected ? "Rejeté" : "Non rejeté"}
            </span>
            <span className={`badge ${onchain.isVerified ? "badge--ok" : "badge--warn"}`}>
              {onchain.isVerified ? "Autorisé à acheter" : "Non autorisé à acheter"}
            </span>
          </div>

          {onchain.kycHash && onchain.kycHash !== ZERO && (
            <p className="muted" style={{ marginTop: 10 }}>
              Hash on-chain (documentHash) : <code>{onchain.kycHash}</code>
            </p>
          )}

          {txHash && (
            <p style={{ marginTop: 10 }}>
              Preuve d’envoi (TX) : <code>{txHash}</code>{" "}
              <a className="link" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                Ouvrir ↗
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__body">
          <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Informations KYC</h3>
            <span className={`badge ${hasLocal ? "badge--ok" : "badge--warn"}`}>{hasLocal ? "Pré-rempli" : "Nouveau"}</span>
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <div className="grid2">
              <div>
                <label className="label">Prénom</label>
                <input className="input" name="firstname" value={form.firstname} onChange={updateField} required />
              </div>
              <div>
                <label className="label">Nom</label>
                <input className="input" name="lastname" value={form.lastname} onChange={updateField} required />
              </div>
            </div>

            <div className="grid2">
              <div>
                <label className="label">Date de naissance</label>
                <input className="input" type="date" name="birthDate" value={form.birthDate} onChange={updateField} required />
                {age !== null && (
                  <p className="muted" style={{ marginTop: 6 }}>
                    Âge : <strong>{age}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="label">Nationalité</label>
                <select className="input" name="nationality" value={form.nationality} onChange={updateField}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid2">
              <div>
                <label className="label">Résidence fiscale</label>
                <select className="input" name="taxCountry" value={form.taxCountry} onChange={updateField}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Pays (adresse)</label>
                <select className="input" name="country" value={form.country} onChange={updateField}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* ✅ DOM/COM seulement si pays adresse = France */}
                {form.country === "France" && (
                  <div style={{ marginTop: 10 }}>
                    <label className="label">France / DOM-COM (adresse)</label>
                    <select className="input" name="addressRegionFR" value={form.addressRegionFR} onChange={updateField}>
                      <option value="">— Choisir —</option>
                      {FRENCH_OVERSEAS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="grid2">
              <div>
                <label className="label">Rue</label>
                <input className="input" name="street" value={form.street} onChange={updateField} required />
              </div>
              <div>
                <label className="label">Ville</label>
                <input className="input" name="city" value={form.city} onChange={updateField} required />
              </div>
            </div>

            <div className="divider" />

            <div>
              <label className="label">Pièce d’identité (PDF/JPG/PNG)</label>
              <input style={fileInputStyle} type="file" accept="application/pdf,image/*" onChange={(e) => handleFileChange("idDoc", e.target.files?.[0])} />
              {files.idDoc?.name && <p className="muted">Sélectionné : {files.idDoc.name}</p>}
              <p className="muted" style={{ marginTop: 6 }}>Les fichiers ne sont pas stockés (ni serveur, ni local, ni on-chain).</p>
            </div>

            <div>
              <label className="label">Justificatif de domicile</label>
              <input style={fileInputStyle} type="file" accept="application/pdf,image/*" onChange={(e) => handleFileChange("proofOfAddress", e.target.files?.[0])} />
              {files.proofOfAddress?.name && <p className="muted">Sélectionné : {files.proofOfAddress.name}</p>}
              <p className="muted" style={{ marginTop: 6 }}>Les fichiers ne sont pas stockés (ni serveur, ni local, ni on-chain).</p>
            </div>

            <div>
              <label className="label">Avis d’imposition (optionnel)</label>
              <input style={fileInputStyle} type="file" accept="application/pdf,image/*" onChange={(e) => handleFileChange("taxNotice", e.target.files?.[0])} />
              {files.taxNotice?.name && <p className="muted">Sélectionné : {files.taxNotice.name}</p>}
              <p className="muted" style={{ marginTop: 6 }}>Les fichiers ne sont pas stockés (ni serveur, ni local, ni on-chain).</p>
            </div>

            <div className="flex" style={{ gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <button className="crystalBtn crystalBtn--gold" type="submit" disabled={isPending || onchain.exists}>
                <span className="crystalBtn__shimmer" />
                <span style={{ position: "relative", zIndex: 2 }}>
                  {onchain.exists ? "Déjà soumis" : isPending ? "Envoi..." : "Soumettre KYC"}
                </span>
              </button>
            </div>

            <p className="muted" style={{ marginTop: 6 }}>
              Preuve d’envoi = <strong>hash de transaction</strong>. Données conservées localement : uniquement champs texte.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
