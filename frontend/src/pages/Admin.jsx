import React, { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { readContract } from "wagmi/actions";
import { config } from "../web3/wagmiConfig.js";

import { CONTRACTS } from "../config/contracts.js";

import IdentityJSON from "../abis/IdentityRegistry.json";
import KYCJSON from "../abis/KYCRequestRegistry.json";
import TokenFactoryJSON from "../abis/TokenFactory.json";
import HouseTokenJSON from "../abis/HouseSecurityToken.json";
import SaleFactoryJSON from "../abis/SaleFactory.json";
import { parseEther } from "viem";

const IdentityABI = IdentityJSON.abi;
const KYCABI = KYCJSON.abi;
const TokenFactoryABI = TokenFactoryJSON.abi;
const HouseTokenABI = HouseTokenJSON.abi;
const SaleFactoryABI = SaleFactoryJSON.abi;

function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

export default function Admin() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  // ---- Vérifier si admin (owner de IdentityRegistry) ----
  const { data: ownerAddress } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "owner",
  });

  const isAdmin =
    isConnected &&
    address &&
    ownerAddress &&
    address.toLowerCase() === ownerAddress.toLowerCase();

  // =========================================================================
  // 1) GESTION KYC
  // =========================================================================

  // Pour recherche manuelle par adresse
  const [kycWallet, setKycWallet] = useState("");

  const { data: kycRequest } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCABI,
    functionName: "requests",
    args: isValidAddress(kycWallet) ? [kycWallet] : undefined,
    query: { enabled: isValidAddress(kycWallet) },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: isValidAddress(kycWallet) ? [kycWallet] : undefined,
    query: { enabled: isValidAddress(kycWallet) },
  });

  let exists = false;
  let approved = false;
  let rejected = false;
  let kycHash = null;

  if (kycRequest) {
    const arr = Array.isArray(kycRequest) ? kycRequest : [];
    kycHash = arr[0];
    exists = arr[1];
    approved = arr[2];
    rejected = arr[3];
  }

  async function handleApproveKYC(e) {
    e.preventDefault();
    if (!isValidAddress(kycWallet)) {
      alert("Adresse invalide.");
      return;
    }
    if (!exists) {
      alert("Aucune demande KYC pour ce wallet.");
      return;
    }

    try {
      await writeContract({
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCABI,
        functionName: "approveKYC",
        args: [kycWallet],
      });

      if (!isVerified) {
        await writeContract({
          address: CONTRACTS.identityRegistry,
          abi: IdentityABI,
          functionName: "verifyInvestor",
          args: [kycWallet],
        });
      }

      alert("KYC approuvé & wallet whiteliste.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur approbation KYC");
    }
  }

  async function handleRejectKYC(e) {
    e.preventDefault();
    if (!isValidAddress(kycWallet)) {
      alert("Adresse invalide.");
      return;
    }
    if (!exists) {
      alert("Aucune demande KYC pour ce wallet.");
      return;
    }

    try {
      await writeContract({
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCABI,
        functionName: "rejectKYC",
        args: [kycWallet],
      });

      if (isVerified) {
        await writeContract({
          address: CONTRACTS.identityRegistry,
          abi: IdentityABI,
          functionName: "revokeInvestor",
          args: [kycWallet],
        });
      }

      alert("KYC refusé & whitelist révoquée.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur rejet KYC");
    }
  }

  async function handleRevokeInvestor(e) {
    e.preventDefault();
    if (!isValidAddress(kycWallet)) {
      alert("Adresse invalide.");
      return;
    }

    try {
      await writeContract({
        address: CONTRACTS.identityRegistry,
        abi: IdentityABI,
        functionName: "revokeInvestor",
        args: [kycWallet],
      });

      alert("Droit d'investir révoqué.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur revokeInvestor");
    }
  }

  // =========================================================================
  // 1 bis) LISTE DES DEMANDES KYC (localStorage + on-chain)
  // =========================================================================

  const [kycForms] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kycForms") || "{}");
    } catch {
      return {};
    }
  });

  const [kycList, setKycList] = useState([]);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    async function loadStatuses() {
      const entries = Object.values(kycForms || {});
      const result = [];

      for (const item of entries) {
        const wallet = item.wallet;
        try {
          const [req, verified] = await Promise.all([
            readContract(config, {
              address: CONTRACTS.kycRequestRegistry,
              abi: KYCABI,
              functionName: "requests",
              args: [wallet],
            }),
            readContract(config, {
              address: CONTRACTS.identityRegistry,
              abi: IdentityABI,
              functionName: "isVerified",
              args: [wallet],
            }),
          ]);

          let existsReq = false;
          let approvedReq = false;
          let rejectedReq = false;
          let reqHash = null;

          if (Array.isArray(req) && req.length >= 4) {
            reqHash = req[0];
            existsReq = req[1];
            approvedReq = req[2];
            rejectedReq = req[3];
          }

          result.push({
            ...item,
            exists: existsReq,
            approved: approvedReq,
            rejected: rejectedReq,
            isVerified: Boolean(verified),
            kycHash: reqHash,
          });
        } catch (err) {
          console.error("Erreur loadStatuses:", err);
          result.push({
            ...item,
            exists: false,
            approved: false,
            rejected: false,
            isVerified: false,
          });
        }
      }

      setKycList(result);
    }

    loadStatuses();
  }, [kycForms, reloadFlag]);

  const pendingList = kycList.filter(
    (i) => i.exists && !i.approved && !i.rejected
  );
  const approvedList = kycList.filter((i) => i.approved);
  const rejectedList = kycList.filter((i) => i.rejected);

  // =========================================================================
  // 2) GESTION DES BIENS (TOKENS) + MÉTADONNÉES FRONT
  // =========================================================================

  const [propertyMeta, setPropertyMeta] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("propertyMeta") || "{}");
    } catch {
      return {};
    }
  });

  function savePropertyMeta(newMeta) {
    setPropertyMeta(newMeta);
    localStorage.setItem("propertyMeta", JSON.stringify(newMeta));
  }

  const [newTokenForm, setNewTokenForm] = useState({
    name: "",
    symbol: "",
    maxSupply: "",
    projectOwner: "",
    addressLine: "",
    city: "",
    country: "",
    price: "",
    rooms: "",
    sqm: "",
    yield: "",
    description: "",
  });
  const [imageDataUrl, setImageDataUrl] = useState("");

  function updateNewTokenField(e) {
    setNewTokenForm({ ...newTokenForm, [e.target.name]: e.target.value });
  }

  function handleNewImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setImageDataUrl(result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateToken(e) {
    e.preventDefault();

    const {
      name,
      symbol,
      maxSupply,
      projectOwner,
      addressLine,
      city,
      country,
      price,
      rooms,
      sqm,
      yield: yieldPct,
      description,
    } = newTokenForm;

    if (!name || !symbol || !maxSupply || !isValidAddress(projectOwner)) {
      alert(
        "Complète name, symbol, maxSupply et projectOwner (adresse valide)."
      );
      return;
    }

    try {
      // 1) création du token on-chain
      await writeContract({
        address: CONTRACTS.tokenFactory,
        abi: TokenFactoryABI,
        functionName: "createHouseToken",
        args: [name, symbol, BigInt(maxSupply), projectOwner],
      });

      // 2) récupérer le dernier token
      const countAfter = await readContract(config, {
        address: CONTRACTS.tokenFactory,
        abi: TokenFactoryABI,
        functionName: "getHouseTokenCount",
      });

      const lastIndex = Number(countAfter) - 1;
      const tokenAddr = await readContract(config, {
        address: CONTRACTS.tokenFactory,
        abi: TokenFactoryABI,
        functionName: "allHouseTokens",
        args: [lastIndex],
      });

      const key = tokenAddr.toLowerCase();
      const metaCopy = { ...propertyMeta };

      metaCopy[key] = {
        token: tokenAddr,
        name,
        symbol,
        addressLine,
        city,
        country,
        price,
        rooms,
        sqm,
        yield: yieldPct,
        description,
        imageDataUrl: imageDataUrl || null,
        published: true, // publié par défaut dans le market
        projectOwner,    // pour la création de sale auto
      };

      savePropertyMeta(metaCopy);

      alert("Token créé + infos du bien enregistrées (publié dans le market).");

      setNewTokenForm({
        name: "",
        symbol: "",
        maxSupply: "",
        projectOwner: "",
        addressLine: "",
        city: "",
        country: "",
        price: "",
        rooms: "",
        sqm: "",
        yield: "",
        description: "",
      });
      setImageDataUrl("");

      setReloadFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur createHouseToken");
    }
  }

  // ------- Création auto du contrat de vente -------

  async function handleCreateSaleForToken(tokenAddr, projectOwner) {
    const priceEth = salePriceInputs[tokenAddr];

    if (!priceEth || Number(priceEth) <= 0) {
      alert("Merci de renseigner un prix par token en ETH (ex : 0.05).");
      return;
    }

    try {
      const priceWei = parseEther(priceEth); // string -> bigint

      await writeContract({
        address: CONTRACTS.saleFactory,
        abi: SaleFactoryABI,
        functionName: "createSaleForToken",
        args: [tokenAddr, projectOwner, priceWei],
      });

      alert("Contrat de vente HouseEthSale créé et lié au token.");
      setReloadFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur createSaleForToken");
    }
  }

  // ------- Liste des tokens on-chain -------
  const [tokens, setTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  useEffect(() => {
    async function loadTokens() {
      try {
        setLoadingTokens(true);

        const count = await readContract(config, {
          address: CONTRACTS.tokenFactory,
          abi: TokenFactoryABI,
          functionName: "getHouseTokenCount",
        });

        const n = Number(count);
        const list = [];

        for (let i = 0; i < n; i++) {
          const tokenAddr = await readContract(config, {
            address: CONTRACTS.tokenFactory,
            abi: TokenFactoryABI,
            functionName: "allHouseTokens",
            args: [i],
          });

          const [name, symbol, totalSupply, maxSupply, saleContract] =
            await Promise.all([
              readContract(config, {
                address: tokenAddr,
                abi: HouseTokenABI,
                functionName: "name",
              }),
              readContract(config, {
                address: tokenAddr,
                abi: HouseTokenABI,
                functionName: "symbol",
              }),
              readContract(config, {
                address: tokenAddr,
                abi: HouseTokenABI,
                functionName: "totalSupply",
              }),
              readContract(config, {
                address: tokenAddr,
                abi: HouseTokenABI,
                functionName: "maxSupply",
              }),
              readContract(config, {
                address: tokenAddr,
                abi: HouseTokenABI,
                functionName: "saleContract",
              }),
            ]);

          const ts = totalSupply ?? 0n;
          const ms = maxSupply ?? 0n;

          list.push({
            address: tokenAddr,
            name,
            symbol,
            totalSupply: ts,
            maxSupply: ms,
            saleContract,
          });
        }

        setTokens(list);
      } catch (err) {
        console.error("Erreur loadTokens:", err);
      } finally {
        setLoadingTokens(false);
      }
    }

    loadTokens();
  }, [reloadFlag]);

  // ------- Helpers META pour tokens existants -------

  function getMeta(tokenAddr) {
    const key = tokenAddr.toLowerCase();
    const existing = propertyMeta[key];
    if (existing) return existing;
    return {
      token: tokenAddr,
      addressLine: "",
      city: "",
      country: "",
      price: "",
      rooms: "",
      sqm: "",
      yield: "",
      description: "",
      imageDataUrl: null,
      published: false,
      projectOwner: "",
    };
  }

  function updatePropertyField(tokenAddr, field, value) {
    const key = tokenAddr.toLowerCase();
    const current = getMeta(tokenAddr);

    if (current.published && field !== "published") {
      alert(
        "Ce bien est publié dans le market. Dépublie-le d'abord pour modifier ses informations."
      );
      return;
    }

    const updated = { ...current, [field]: value };
    const next = { ...propertyMeta, [key]: updated };
    savePropertyMeta(next);
  }

  function handleExistingImageChange(tokenAddr, file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        updatePropertyField(tokenAddr, "imageDataUrl", result);
      }
    };
    reader.readAsDataURL(file);
  }

  function setPublished(tokenAddr, published) {
    updatePropertyField(tokenAddr, "published", published);
  }

  // ------- Etat pour prix par token (sale) -------
  const [salePriceInputs, setSalePriceInputs] = useState({});

  function updateSalePriceInput(tokenAddr, value) {
    setSalePriceInputs((prev) => ({ ...prev, [tokenAddr]: value }));
  }

  // ------- Actions token on-chain : pause / unpause / burn -------

  const [burnInputs, setBurnInputs] = useState({});

  async function handlePauseToken(tokenAddr) {
    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "pause",
        args: [],
      });
      alert("Token mis en pause (transferts bloqués).");
      setReloadFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur pause()");
    }
  }

  async function handleUnpauseToken(tokenAddr) {
    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "unpause",
        args: [],
      });
      alert("Token dépausé (transferts ré-autorisés).");
      setReloadFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur unpause()");
    }
  }

  function updateBurnInput(tokenAddr, field, value) {
    setBurnInputs((prev) => ({
      ...prev,
      [tokenAddr]: { ...(prev[tokenAddr] || {}), [field]: value },
    }));
  }

  async function handleBurnToken(tokenAddr) {
    const input = burnInputs[tokenAddr] || {};
    const from = input.from;
    const amountStr = input.amount;

    if (!isValidAddress(from)) {
      alert("Adresse 'from' invalide pour burn.");
      return;
    }
    if (!amountStr || Number(amountStr) <= 0) {
      alert("Montant à burn invalide.");
      return;
    }

    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "burn",
        args: [from, BigInt(amountStr)],
      });
      alert("Tokens burnés avec succès.");
      setReloadFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur burn()");
    }
  }

  // ------- Gestion contrat de vente (édition manuelle) -------

  const [saleInputs, setSaleInputs] = useState({}); // tokenAddr -> saleAddr
  const [editSaleMode, setEditSaleMode] = useState({}); // tokenAddr -> bool

  function updateSaleInput(tokenAddr, value) {
    setSaleInputs((prev) => ({ ...prev, [tokenAddr]: value }));
  }

  function toggleEditSale(tokenAddr) {
    setEditSaleMode((prev) => ({
      ...prev,
      [tokenAddr]: !prev[tokenAddr],
    }));
  }

  async function handleSetSaleContract(tokenAddr) {
    const saleAddr = saleInputs[tokenAddr];
    if (!isValidAddress(saleAddr)) {
      alert("Adresse du contrat de vente invalide.");
      return;
    }

    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "setSaleContract",
        args: [saleAddr],
      });

      alert("Contrat de vente lié au token.");
      setReloadFlag((x) => x + 1);
      setEditSaleMode((prev) => ({ ...prev, [tokenAddr]: false }));
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur setSaleContract");
    }
  }

  // RENDU

  if (!isConnected) {
    return (
      <div>
        <h1>Espace admin</h1>
        <p>
          Connecte-toi avec le wallet admin (platformOwner) pour voir cet
          espace.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <h1>Espace admin</h1>
        <p>Tu n&apos;es pas autorisé à accéder à l&apos;administration.</p>
        <p>
          Wallet connecté : <code>{address}</code>
        </p>
        <p>
          Owner attendu : <code>{ownerAddress?.toString()}</code>
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      <h1>Back-office Plateforme</h1>
      <p>
        Connecté en tant qu&apos;<strong>admin</strong> :{" "}
        <code>{address}</code>
      </p>

      {/* ------- BLOC 1 : KYC (par adresse) ------- */}
      <section
        style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}
      >
        <h2>1. Gestion KYC (recherche par wallet)</h2>

        <div style={{ marginBottom: "1rem" }}>
          <label>Adresse investisseur</label>
          <input
            style={{ width: "100%" }}
            value={kycWallet}
            onChange={(e) => setKycWallet(e.target.value)}
            placeholder="0x..."
          />
        </div>

        {isValidAddress(kycWallet) && (
          <div style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>
            <p>exists: {String(exists)}</p>
            <p>approved: {String(approved)}</p>
            <p>rejected: {String(rejected)}</p>
            <p>isVerified: {String(isVerified)}</p>
            {kycHash && (
              <p>
                kycHash: <code>{kycHash}</code>
              </p>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button onClick={handleApproveKYC} disabled={isPending}>
            ✅ Approuver KYC + Whitelist
          </button>
          <button onClick={handleRejectKYC} disabled={isPending}>
            ❌ Refuser KYC (+ révoquer whitelist)
          </button>
          <button onClick={handleRevokeInvestor} disabled={isPending}>
            🧊 Révoquer seulement le droit d&apos;investir
          </button>
        </div>
      </section>

      {/* ------- BLOC 1 bis : Liste des demandes KYC ------- */}
      <section
        style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}
      >
        <h2>1 bis. Demandes KYC (local + statut on-chain)</h2>
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          Les formulaires KYC soumis par les investisseurs sont stockés côté
          front (localStorage) et recoupés avec le statut on-chain
          (&quot;requests&quot; + &quot;isVerified&quot;).
        </p>

        <div style={{ display: "grid", gap: "1rem" }}>
          {/* En attente */}
          <div>
            <h3>En attente</h3>
            {pendingList.length === 0 && <p>Aucune demande en attente.</p>}
            {pendingList.map((item) => (
              <div
                key={item.wallet}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: "0.5rem",
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                <p>
                  <strong>Wallet :</strong> <code>{item.wallet}</code>
                </p>
                <p>
                  <strong>Nom :</strong> {item.form.lastname}{" "}
                  {item.form.firstname}
                </p>
                <p>
                  <strong>Adresse :</strong> {item.form.street},{" "}
                  {item.form.city}, {item.form.country}
                </p>
                {item.kycHash && (
                  <p>
                    <strong>Hash KYC :</strong>{" "}
                    <code>{item.kycHash}</code>
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginTop: "0.25rem",
                  }}
                >
                  <button
                    onClick={async () => {
                      try {
                        await writeContract({
                          address: CONTRACTS.kycRequestRegistry,
                          abi: KYCABI,
                          functionName: "approveKYC",
                          args: [item.wallet],
                        });
                        await writeContract({
                          address: CONTRACTS.identityRegistry,
                          abi: IdentityABI,
                          functionName: "verifyInvestor",
                          args: [item.wallet],
                        });
                        alert("KYC approuvé & wallet whiteliste.");
                        setReloadFlag((x) => x + 1);
                      } catch (err) {
                        console.error(err);
                        alert(
                          err?.shortMessage ||
                            err?.message ||
                            "Erreur approbation"
                        );
                      }
                    }}
                  >
                    ✅ Approuver
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await writeContract({
                          address: CONTRACTS.kycRequestRegistry,
                          abi: KYCABI,
                          functionName: "rejectKYC",
                          args: [item.wallet],
                        });
                        await writeContract({
                          address: CONTRACTS.identityRegistry,
                          abi: IdentityABI,
                          functionName: "revokeInvestor",
                          args: [item.wallet],
                        });
                        alert("KYC rejeté & whitelist révoquée.");
                        setReloadFlag((x) => x + 1);
                      } catch (err) {
                        console.error(err);
                        alert(
                          err?.shortMessage ||
                            err?.message ||
                            "Erreur rejet"
                        );
                      }
                    }}
                  >
                    ❌ Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Approuvés */}
          <div>
            <h3>Approuvés</h3>
            {approvedList.length === 0 && <p>Aucun KYC approuvé.</p>}
            {approvedList.map((item) => (
              <div
                key={item.wallet}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: "0.5rem",
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                <p>
                  <strong>Wallet :</strong> <code>{item.wallet}</code>
                </p>
                <p>
                  <strong>Nom :</strong> {item.form.lastname}{" "}
                  {item.form.firstname}
                </p>
                <p>
                  <strong>isVerified :</strong>{" "}
                  {String(item.isVerified)}
                </p>
              </div>
            ))}
          </div>

          {/* Rejetés */}
          <div>
            <h3>Rejetés</h3>
            {rejectedList.length === 0 && <p>Aucun KYC rejeté.</p>}
            {rejectedList.map((item) => (
              <div
                key={item.wallet}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: "0.5rem",
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                <p>
                  <strong>Wallet :</strong> <code>{item.wallet}</code>
                </p>
                <p>
                  <strong>Nom :</strong> {item.form.lastname}{" "}
                  {item.form.firstname}
                </p>
                <p>
                  <strong>isVerified :</strong>{" "}
                  {String(item.isVerified)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------- BLOC 2 : CRÉATION D’UN BIEN ------- */}
      <section
        style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}
      >
        <h2>2. Créer un nouveau bien (token + infos du bien)</h2>
        <form
          onSubmit={handleCreateToken}
          style={{ display: "grid", gap: "0.5rem", maxWidth: 650 }}
        >
          <h3>Paramètres on-chain</h3>
          <div>
            <label>Nom du bien</label>
            <input
              name="name"
              value={newTokenForm.name}
              onChange={updateNewTokenField}
            />
          </div>
          <div>
            <label>Symbole</label>
            <input
              name="symbol"
              value={newTokenForm.symbol}
              onChange={updateNewTokenField}
            />
          </div>
          <div>
            <label>Max supply (nombre total de tokens)</label>
            <input
              name="maxSupply"
              type="number"
              value={newTokenForm.maxSupply}
              onChange={updateNewTokenField}
            />
          </div>
          <div>
            <label>Adresse du projectOwner (SPV, etc.)</label>
            <input
              name="projectOwner"
              value={newTokenForm.projectOwner}
              onChange={updateNewTokenField}
              placeholder="0x..."
            />
          </div>

          <h3>Infos du bien (front uniquement)</h3>
          <div>
            <label>Adresse du bien</label>
            <input
              name="addressLine"
              value={newTokenForm.addressLine}
              onChange={updateNewTokenField}
              placeholder="12 rue des Tulipes"
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label>Ville</label>
              <input
                name="city"
                value={newTokenForm.city}
                onChange={updateNewTokenField}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Pays</label>
              <input
                name="country"
                value={newTokenForm.country}
                onChange={updateNewTokenField}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label>Prix du bien (€)</label>
              <input
                name="price"
                type="number"
                value={newTokenForm.price}
                onChange={updateNewTokenField}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Surface (m²)</label>
              <input
                name="sqm"
                type="number"
                value={newTokenForm.sqm}
                onChange={updateNewTokenField}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label>Nombre de pièces</label>
              <input
                name="rooms"
                type="number"
                value={newTokenForm.rooms}
                onChange={updateNewTokenField}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Rendement cible (%)</label>
              <input
                name="yield"
                type="number"
                step="0.1"
                value={newTokenForm.yield}
                onChange={updateNewTokenField}
              />
            </div>
          </div>

          <div>
            <label>Image du bien (upload)</label>
            <input type="file" accept="image/*" onChange={handleNewImageChange} />
            {imageDataUrl && (
              <div style={{ marginTop: "0.5rem" }}>
                <p>Prévisualisation :</p>
                <img
                  src={imageDataUrl}
                  alt="Prévisualisation du bien"
                  style={{ maxWidth: 200, borderRadius: 8 }}
                />
              </div>
            )}
          </div>

          <div>
            <label>Description</label>
            <textarea
              name="description"
              value={newTokenForm.description}
              onChange={updateNewTokenField}
              rows={3}
            />
          </div>

          <button type="submit" disabled={isPending}>
            🚀 Créer le token + infos du bien
          </button>
        </form>
      </section>

      {/* ------- BLOC 3 : LISTE DES TOKENS ------- */}
      <section
        style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}
      >
        <h2>3. Tokens existants (créés par TokenFactory)</h2>
        {loadingTokens && <p>Chargement des tokens...</p>}
        {!loadingTokens && tokens.length === 0 && (
          <p>Aucun token maison pour le moment.</p>
        )}

        {!loadingTokens &&
          tokens.map((t) => {
            const ts = t.totalSupply ?? 0n;
            const ms = t.maxSupply ?? 0n;
            const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

            const meta = getMeta(t.address);
            const burn = burnInputs[t.address] || {};
            const isLinked =
              t.saleContract &&
              t.saleContract !==
                "0x0000000000000000000000000000000000000000";

            const isPublished = !!meta.published;
            const metaDisabled = isPublished;

            return (
              <div
                key={t.address}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                <h3>
                  {t.name} ({t.symbol})
                </h3>
                <p>
                  Adresse token : <code>{t.address}</code>
                </p>
                <p>
                  Supply : {String(ts)} / {String(ms)} ({progress}%)
                </p>

                <p>
                  Statut market :{" "}
                  {isPublished ? "✅ Publié" : "⏳ Non publié"}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {!isPublished && (
                    <button onClick={() => setPublished(t.address, true)}>
                      📢 Publier dans le market
                    </button>
                  )}
                  {isPublished && (
                    <button onClick={() => setPublished(t.address, false)}>
                      📴 Dépublier du market (pour modifier)
                    </button>
                  )}
                </div>

                {/* Meta du bien + édition */}
                <div
                  style={{
                    background: "#fafafa",
                    padding: "0.5rem",
                    borderRadius: 6,
                    margin: "0.5rem 0",
                    fontSize: "0.9rem",
                  }}
                >
                  <p style={{ fontWeight: "bold" }}>
                    Infos du bien (front uniquement):
                  </p>

                  <div style={{ marginBottom: "0.25rem" }}>
                    <label>Adresse du bien</label>
                    <input
                      style={{ width: "100%" }}
                      value={meta.addressLine || ""}
                      onChange={(e) =>
                        updatePropertyField(
                          t.address,
                          "addressLine",
                          e.target.value
                        )
                      }
                      disabled={metaDisabled}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <div style={{ flex: 1 }}>
                      <label>Ville</label>
                      <input
                        style={{ width: "100%" }}
                        value={meta.city || ""}
                        onChange={(e) =>
                          updatePropertyField(
                            t.address,
                            "city",
                            e.target.value
                          )
                        }
                        disabled={metaDisabled}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Pays</label>
                      <input
                        style={{ width: "100%" }}
                        value={meta.country || ""}
                        onChange={(e) =>
                          updatePropertyField(
                            t.address,
                            "country",
                            e.target.value
                          )
                        }
                        disabled={metaDisabled}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <div style={{ flex: 1 }}>
                      <label>Prix (€)</label>
                      <input
                        style={{ width: "100%" }}
                        type="number"
                        value={meta.price || ""}
                        onChange={(e) =>
                          updatePropertyField(
                            t.address,
                            "price",
                            e.target.value
                          )
                        }
                        disabled={metaDisabled}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Surface (m²)</label>
                      <input
                        style={{ width: "100%" }}
                        type="number"
                        value={meta.sqm || ""}
                        onChange={(e) =>
                          updatePropertyField(
                            t.address,
                            "sqm",
                            e.target.value
                          )
                        }
                        disabled={metaDisabled}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <div style={{ flex: 1 }}>
                      <label>Pièces</label>
                      <input
                        style={{ width: "100%" }}
                        type="number"
                        value={meta.rooms || ""}
                        onChange={(e) =>
                          updatePropertyField(
                            t.address,
                            "rooms",
                            e.target.value
                          )
                        }
                        disabled={metaDisabled}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Rendement (%)</label>
                      <input
                        style={{ width: "100%" }}
                        type="number"
                        step="0.1"
                        value={meta.yield || ""}
                        onChange={(e) =>
                          updatePropertyField(
                            t.address,
                            "yield",
                            e.target.value
                          )
                        }
                        disabled={metaDisabled}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: "0.25rem" }}>
                    <label>Image du bien (upload)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        handleExistingImageChange(
                          t.address,
                          e.target.files?.[0]
                        )
                      }
                      disabled={metaDisabled}
                    />
                    {meta.imageDataUrl && (
                      <div style={{ marginTop: "0.25rem" }}>
                        <img
                          src={meta.imageDataUrl}
                          alt="Aperçu"
                          style={{ maxWidth: 180, borderRadius: 8 }}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: "0.25rem" }}>
                    <label>Description</label>
                    <textarea
                      rows={3}
                      style={{ width: "100%" }}
                      value={meta.description || ""}
                      onChange={(e) =>
                        updatePropertyField(
                          t.address,
                          "description",
                          e.target.value
                        )
                      }
                      disabled={metaDisabled}
                    />
                  </div>
                </div>

                {/* Actions token : pause / unpause */}
                <div
                  style={{
                    marginTop: "0.5rem",
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button onClick={() => handlePauseToken(t.address)}>
                    ⏸ Pause transferts
                  </button>
                  <button onClick={() => handleUnpauseToken(t.address)}>
                    ▶️ Reprendre transferts
                  </button>
                </div>

                {/* Gestion du contrat de vente */}
                <div style={{ marginTop: "0.75rem" }}>
                  <p>
                    Contrat de vente lié :{" "}
                    <code>
                      {isLinked ? t.saleContract : "Aucun"}
                    </code>
                  </p>

                  {!isLinked && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <h4>Contrat de vente (HouseEthSale)</h4>
                      <p style={{ fontSize: "0.9rem" }}>
                        Ce token n&apos;a pas encore de contrat de vente. Tu peux en créer un
                        automatiquement (déploiement + liaison).
                      </p>

                      <label>Prix par token (en ETH)</label>
                      <input
                        style={{ width: "100%", marginBottom: "0.25rem" }}
                        placeholder="Ex : 0.05"
                        type="number"
                        step="0.0001"
                        value={salePriceInputs[t.address] || ""}
                        onChange={(e) => updateSalePriceInput(t.address, e.target.value)}
                      />

                      <button
                        onClick={() =>
                          handleCreateSaleForToken(
                            t.address,
                            meta.projectOwner || address
                          )
                        }
                      >
                        🏷️ Créer automatiquement le contrat de vente
                      </button>
                    </div>
                  )}

                  {isLinked && (
                    <>
                      {!editSaleMode[t.address] && (
                        <button
                          style={{ marginTop: "0.25rem" }}
                          onClick={() => toggleEditSale(t.address)}
                        >
                          ✏️ Modifier l&apos;adresse du contrat HouseEthSale
                        </button>
                      )}

                      {editSaleMode[t.address] && (
                        <>
                          <label>Nouvelle adresse HouseEthSale</label>
                          <input
                            style={{ width: "100%" }}
                            value={saleInputs[t.address] || ""}
                            onChange={(e) =>
                              updateSaleInput(t.address, e.target.value)
                            }
                            placeholder="0x..."
                          />
                          <button
                            style={{ marginTop: "0.25rem" }}
                            onClick={() => handleSetSaleContract(t.address)}
                          >
                            💾 Enregistrer la nouvelle adresse
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Burn tokens */}
                <div style={{ marginTop: "0.75rem" }}>
                  <h4>Burn de tokens</h4>
                  <input
                    style={{ width: "100%", marginBottom: "0.25rem" }}
                    placeholder="Adresse from (investisseur ou projectOwner)"
                    value={burn.from || ""}
                    onChange={(e) =>
                      updateBurnInput(t.address, "from", e.target.value)
                    }
                  />
                  <input
                    style={{ width: "100%", marginBottom: "0.25rem" }}
                    placeholder="Quantité à burn"
                    type="number"
                    value={burn.amount || ""}
                    onChange={(e) =>
                      updateBurnInput(t.address, "amount", e.target.value)
                    }
                  />
                  <button onClick={() => handleBurnToken(t.address)}>
                    🔥 Burn tokens
                  </button>
                </div>
              </div>
            );
          })}
      </section>
    </div>
  );
}
