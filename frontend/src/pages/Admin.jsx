import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { config } from "../web3/wagmiConfig.js";

import { CONTRACTS } from "../config/contracts.js";

import IdentityJSON from "../abis/IdentityRegistry.json";
import KYCJSON from "../abis/KYCRequestRegistry.json";
import TokenFactoryJSON from "../abis/TokenFactory.json";
import HouseTokenJSON from "../abis/HouseSecurityToken.json";
import SaleJSON from "../abis/HouseEthSale.json";

import CrystalButton from "../components/CrystalButton.jsx";

const IdentityABI = IdentityJSON.abi;
const KYCABI = KYCJSON.abi;
const TokenFactoryABI = TokenFactoryJSON.abi;
const HouseTokenABI = HouseTokenJSON.abi;
const SaleABI = SaleJSON.abi;

const ZERO = "0x0000000000000000000000000000000000000000";

function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

function isZeroAddress(a) {
  return !a || a === ZERO;
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str ?? "");
  } catch {
    return fallback;
  }
}

/* ===================== IMAGE HELPERS (local only) ===================== */
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Compression simple pour éviter de remplir localStorage trop vite
// - réduit largeur max
// - convertit en jpeg (plus léger que png la plupart du temps)
async function compressImageToDataUrl(file, maxWidth = 1400, quality = 0.82) {
  const src = await fileToDataUrl(file);

  if (!file.type?.startsWith("image/")) return src;

  const img = new Image();
  img.src = src;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL("image/jpeg", quality);
}

async function handlePropertyImageChange(tokenAddr, file, updatePropertyField) {
  if (!file) return;

  if (file.size > 4 * 1024 * 1024) {
    alert("Image trop lourde (> 4MB). Compresse-la puis réessaie.");
    return;
  }

  try {
    const dataUrl = await compressImageToDataUrl(file);
    updatePropertyField(tokenAddr, "imageDataUrl", dataUrl);
    alert("✅ Image enregistrée (local uniquement).");
  } catch (e) {
    console.error(e);
    alert("Erreur lecture/compression image.");
  }
}

export default function Admin() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const [txError, setTxError] = useState(null);

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
  // HELPERS ACTIONS (KYC)
  // =========================================================================
  async function approveKyc(wallet) {
    return writeContract({
      address: CONTRACTS.kycRequestRegistry,
      abi: KYCABI,
      functionName: "approveKYC",
      args: [wallet],
    });
  }

  async function rejectKyc(wallet) {
    return writeContract({
      address: CONTRACTS.kycRequestRegistry,
      abi: KYCABI,
      functionName: "rejectKYC",
      args: [wallet],
    });
  }

  async function verifyInvestor(wallet) {
    return writeContract({
      address: CONTRACTS.identityRegistry,
      abi: IdentityABI,
      functionName: "verifyInvestor",
      args: [wallet],
    });
  }

  async function revokeInvestor(wallet) {
    return writeContract({
      address: CONTRACTS.identityRegistry,
      abi: IdentityABI,
      functionName: "revokeInvestor",
      args: [wallet],
    });
  }

  // =========================================================================
  // HELPERS ACTIONS (Sale)
  // =========================================================================
  async function activateSale(saleAddr) {
    if (!isValidAddress(saleAddr)) throw new Error("Adresse sale invalide");
    return writeContract({
      address: saleAddr,
      abi: SaleABI,
      functionName: "activateSale",
      args: [],
    });
  }

  async function deactivateSale(saleAddr) {
    if (!isValidAddress(saleAddr)) throw new Error("Adresse sale invalide");
    return writeContract({
      address: saleAddr,
      abi: SaleABI,
      functionName: "deactivateSale",
      args: [],
    });
  }

  // =========================================================================
  // FACTORY: create / deactivate token
  // =========================================================================
  async function createHouseOnChain({ name, symbol, maxSupply, projectOwner }) {
    if (!name?.trim()) throw new Error("Nom vide");
    if (!symbol?.trim()) throw new Error("Symbol vide");
    const ms = BigInt(maxSupply || 0);
    if (ms <= 0n) throw new Error("maxSupply invalide");
    if (!isValidAddress(projectOwner)) throw new Error("projectOwner invalide");

    return writeContract({
      address: CONTRACTS.tokenFactory,
      abi: TokenFactoryABI,
      functionName: "createHouseToken",
      args: [name.trim(), symbol.trim(), ms, projectOwner],
    });
  }

  async function deactivateHouseToken(tokenAddr) {
    if (!isValidAddress(tokenAddr)) throw new Error("tokenAddr invalide");
    return writeContract({
      address: CONTRACTS.tokenFactory,
      abi: TokenFactoryABI,
      functionName: "deactivateHouseToken",
      args: [tokenAddr],
    });
  }

  async function activateHouseToken(tokenAddr) {
    if (!isValidAddress(tokenAddr)) throw new Error("tokenAddr invalide");
    return writeContract({
      address: CONTRACTS.tokenFactory,
      abi: TokenFactoryABI,
      functionName: "activateHouseToken",
      args: [tokenAddr],
    });
  }

  // =========================================================================
  // 1) KYC (recherche manuelle)
  // =========================================================================
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

  const kycManual = useMemo(() => {
    let exists = false;
    let approved = false;
    let rejected = false;
    let kycHash = null;

    if (Array.isArray(kycRequest) && kycRequest.length >= 4) {
      kycHash = kycRequest[0];
      exists = Boolean(kycRequest[1]);
      approved = Boolean(kycRequest[2]);
      rejected = Boolean(kycRequest[3]);
    }

    return {
      exists,
      approved,
      rejected,
      kycHash,
      isVerified: Boolean(isVerified),
    };
  }, [kycRequest, isVerified]);

  const canApproveManual = kycManual.exists && !kycManual.approved && !kycManual.rejected;
  const canRejectManual = kycManual.exists && !kycManual.rejected;
  const canRevokeManual = kycManual.isVerified;
  const canReWhitelistManual = kycManual.approved && !kycManual.isVerified;

  // =========================================================================
  // 1 bis) LISTE KYC (localStorage + statut on-chain)
  // =========================================================================
  const [reloadFlag, setReloadFlag] = useState(0);

  const [kycForms, setKycForms] = useState(() =>
    safeParseJSON(localStorage.getItem("kycForms") || "{}", {})
  );

  function refreshKycForms() {
    setKycForms(safeParseJSON(localStorage.getItem("kycForms") || "{}", {}));
  }

  useEffect(() => {
    function onStorage(e) {
      if (e.key === "kycForms") refreshKycForms();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [kycList, setKycList] = useState([]);

  useEffect(() => {
    async function loadStatuses() {
      const entries = Object.values(kycForms || {});
      const result = [];

      for (const item of entries) {
        const w = item.wallet;
        if (!isValidAddress(w)) continue;

        try {
          const [req, verified] = await Promise.all([
            readContract(config, {
              address: CONTRACTS.kycRequestRegistry,
              abi: KYCABI,
              functionName: "requests",
              args: [w],
            }),
            readContract(config, {
              address: CONTRACTS.identityRegistry,
              abi: IdentityABI,
              functionName: "isVerified",
              args: [w],
            }),
          ]);

          let existsReq = false;
          let approvedReq = false;
          let rejectedReq = false;
          let reqHash = null;

          if (Array.isArray(req) && req.length >= 4) {
            reqHash = req[0];
            existsReq = Boolean(req[1]);
            approvedReq = Boolean(req[2]);
            rejectedReq = Boolean(req[3]);
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

  const pendingList = kycList.filter((i) => i.exists && !i.approved && !i.rejected);
  const approvedWhitelistedList = kycList.filter((i) => i.approved && i.isVerified);
  const approvedFrozenList = kycList.filter((i) => i.approved && !i.isVerified);
  const rejectedList = kycList.filter((i) => i.rejected);

  // =========================================================================
  // 2) BIENS (meta front + tokens on-chain)
  // =========================================================================
  const [propertyMeta, setPropertyMeta] = useState(() =>
    safeParseJSON(localStorage.getItem("propertyMeta") || "{}", {})
  );

  function savePropertyMeta(next) {
    setPropertyMeta(next);
    localStorage.setItem("propertyMeta", JSON.stringify(next));
  }

  useEffect(() => {
    function onStorage(e) {
      if (e.key === "propertyMeta") {
        setPropertyMeta(safeParseJSON(localStorage.getItem("propertyMeta") || "{}", {}));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function getMeta(tokenAddr) {
    const key = tokenAddr.toLowerCase();
    return (
      propertyMeta[key] || {
        token: tokenAddr,
        name: "",
        addressLine: "",
        city: "",
        country: "",
        price: "",
        rooms: "",
        sqm: "",
        yield: "",
        description: "",
        imageDataUrl: null, // ✅ image du bien (local only)
        published: false,
        projectOwner: "",
        spvName: "",
        spvRegistration: "",
        spvContractNumber: "",
      }
    );
  }

  function updatePropertyField(tokenAddr, field, value) {
    const key = tokenAddr.toLowerCase();
    const current = getMeta(tokenAddr);
    const updated = { ...current, [field]: value };
    const next = { ...propertyMeta, [key]: updated };
    savePropertyMeta(next);
  }

  function togglePublish(tokenAddr) {
    const key = tokenAddr.toLowerCase();
    const current = getMeta(tokenAddr);
    const updated = { ...current, published: !Boolean(current.published) };
    const next = { ...propertyMeta, [key]: updated };
    savePropertyMeta(next);
  }

  function unpublishAndHideLocal(tokenAddr) {
    const key = tokenAddr.toLowerCase();
    const current = getMeta(tokenAddr);
    const updated = { ...current, published: false };
    const next = { ...propertyMeta, [key]: updated };
    savePropertyMeta(next);
  }

  const [tokens, setTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  const [saleStatusBySale, setSaleStatusBySale] = useState({});
  const [activeByToken, setActiveByToken] = useState({});
  const [autoActivateAfterLink, setAutoActivateAfterLink] = useState(true);

  useEffect(() => {
    async function loadTokens() {
      try {
        setLoadingTokens(true);

        const count = await readContract(config, {
          address: CONTRACTS.tokenFactory,
          abi: TokenFactoryABI,
          functionName: "getHouseTokenCount",
        });

        const n = Number(count ?? 0n);
        const list = [];

        for (let i = 0; i < n; i++) {
          const tokenAddr = await readContract(config, {
            address: CONTRACTS.tokenFactory,
            abi: TokenFactoryABI,
            functionName: "allHouseTokens",
            args: [i],
          });

          const [name, symbol, totalSupply, maxSupply, saleContract, isActive] = await Promise.all([
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "name" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "symbol" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "totalSupply" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "maxSupply" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "saleContract" }),
            readContract(config, {
              address: CONTRACTS.tokenFactory,
              abi: TokenFactoryABI,
              functionName: "isActive",
              args: [tokenAddr],
            }),
          ]);

          list.push({
            address: tokenAddr,
            name,
            symbol,
            totalSupply: totalSupply ?? 0n,
            maxSupply: maxSupply ?? 0n,
            saleContract,
          });

          setActiveByToken((prev) => ({
            ...prev,
            [String(tokenAddr).toLowerCase()]: Boolean(isActive),
          }));
        }

        setTokens(list);

        const saleAddrs = Array.from(
          new Set(
            list
              .map((t) => t.saleContract)
              .filter((a) => isValidAddress(a) && !isZeroAddress(a))
              .map((a) => a.toLowerCase())
          )
        );

        const nextSales = {};
        for (const s of saleAddrs) {
          try {
            const [active, price] = await Promise.all([
              readContract(config, { address: s, abi: SaleABI, functionName: "saleActive" }),
              readContract(config, { address: s, abi: SaleABI, functionName: "priceWeiPerToken" }),
            ]);
            nextSales[s] = { saleActive: Boolean(active), priceWeiPerToken: BigInt(price ?? 0n) };
          } catch (e) {
            console.error("Erreur lecture sale", s, e);
            nextSales[s] = { saleActive: false, priceWeiPerToken: 0n, error: true };
          }
        }

        setSaleStatusBySale(nextSales);
      } catch (err) {
        console.error("Erreur loadTokens:", err);
      } finally {
        setLoadingTokens(false);
      }
    }

    loadTokens();
  }, [reloadFlag]);

  const [saleInputs, setSaleInputs] = useState({});
  const [editSaleMode, setEditSaleMode] = useState({});

  function toggleEditSale(tokenAddr) {
    setEditSaleMode((prev) => ({ ...prev, [tokenAddr]: !prev[tokenAddr] }));
  }

  function updateSaleInput(tokenAddr, value) {
    setSaleInputs((prev) => ({ ...prev, [tokenAddr]: value }));
  }

  async function handleSetSaleContract(tokenAddr) {
    const saleAddr = saleInputs[tokenAddr];
    if (!isValidAddress(saleAddr)) {
      alert("Adresse HouseEthSale invalide.");
      return;
    }

    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "setSaleContract",
        args: [saleAddr],
      });

      if (autoActivateAfterLink) {
        try {
          await activateSale(saleAddr);
        } catch (e) {
          console.error(e);
          alert("⚠️ Sale lié, mais activation impossible (droits owner/projetOwner).");
        }
      }

      alert("✅ Contrat de vente lié au token.");
      setReloadFlag((x) => x + 1);
      setEditSaleMode((prev) => ({ ...prev, [tokenAddr]: false }));
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur setSaleContract");
    }
  }

  // =========================================================================
  // CREATE NEW PROPERTY UI STATE
  // =========================================================================
  const [newHouse, setNewHouse] = useState({
    name: "",
    symbol: "",
    maxSupply: "100",
    projectOwner: "",
  });

  function updateNewHouse(field, value) {
    setNewHouse((p) => ({ ...p, [field]: value }));
  }

  // =========================================================================
  // RENDER GUARDS
  // =========================================================================
  if (!isConnected) {
    return (
      <div className="container">
        <h1>Admin</h1>
        <p>Connecte-toi avec le wallet admin (platformOwner) pour accéder à l’espace.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container">
        <h1>Admin</h1>
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

  // =========================================================================
  // UI
  // =========================================================================
  return (
    <div className="container" style={{ display: "grid", gap: 24 }}>
      <div className="pagehead">
        <h1 style={{ margin: 0 }}>Back-office</h1>
        <p className="muted" style={{ margin: 0 }}>
          Admin : <code>{address}</code>
        </p>
        {txError && (
          <p className="muted" style={{ marginTop: 8 }}>
            ⚠️ Dernière erreur : <code>{txError}</code>
          </p>
        )}
      </div>

      {/* ========================== SECTION KYC ========================== */}
      <section className="section">
        <div className="section__head">
          <h2 style={{ margin: 0 }}>KYC & Whitelist</h2>
          <p className="muted" style={{ margin: 0 }}>
            Approver = valide la demande KYC · Whitelist = autorise l’achat · Révoquer = gel
          </p>
        </div>

        <div className="grid2">
          <div className="card">
            <div className="card__body">
              <h3 style={{ marginTop: 0 }}>Recherche par wallet</h3>

              <label className="label">Adresse investisseur</label>
              <input
                className="input"
                value={kycWallet}
                onChange={(e) => setKycWallet(e.target.value)}
                placeholder="0x..."
              />

              {isValidAddress(kycWallet) && (
                <div style={{ marginTop: 12 }} className="muted">
                  <div>exists: {String(kycManual.exists)}</div>
                  <div>approved: {String(kycManual.approved)}</div>
                  <div>rejected: {String(kycManual.rejected)}</div>
                  <div>isVerified: {String(kycManual.isVerified)}</div>
                  {kycManual.kycHash && (
                    <div>
                      kycHash: <code>{kycManual.kycHash}</code>
                    </div>
                  )}
                </div>
              )}

              <div className="actionRow" style={{ marginTop: 14 }}>
                <CrystalButton
                  tone="gold"
                  disabled={isPending || !canApproveManual}
                  onClick={async () => {
                    try {
                      setTxError(null);
                      await approveKyc(kycWallet);
                      await verifyInvestor(kycWallet);
                      alert("✅ KYC approuvé + whitelist ON.");
                      setReloadFlag((x) => x + 1);
                      refreshKycForms();
                    } catch (e) {
                      const msg = e?.shortMessage || e?.message || "Erreur approve";
                      setTxError(msg);
                      alert(msg);
                    }
                  }}
                >
                  ✅ Approver + Whitelist
                </CrystalButton>

                <CrystalButton
                  tone="blue"
                  variant="ghost"
                  disabled={isPending || !canRevokeManual}
                  onClick={async () => {
                    try {
                      setTxError(null);
                      await revokeInvestor(kycWallet);
                      alert("🧊 Whitelist révoquée (gel).");
                      setReloadFlag((x) => x + 1);
                    } catch (e) {
                      const msg = e?.shortMessage || e?.message || "Erreur revoke";
                      setTxError(msg);
                      alert(msg);
                    }
                  }}
                >
                  🧊 Révoquer
                </CrystalButton>

                <CrystalButton
                  tone="gold"
                  disabled={isPending || !canReWhitelistManual}
                  onClick={async () => {
                    try {
                      setTxError(null);
                      await verifyInvestor(kycWallet);
                      alert("✅ Wallet re-whiteliste.");
                      setReloadFlag((x) => x + 1);
                    } catch (e) {
                      const msg = e?.shortMessage || e?.message || "Erreur re-whitelist";
                      setTxError(msg);
                      alert(msg);
                    }
                  }}
                >
                  ✅ Re-whitelister
                </CrystalButton>

                <CrystalButton
                  tone="blue"
                  variant="ghost"
                  disabled={isPending || !canRejectManual}
                  onClick={async () => {
                    try {
                      setTxError(null);
                      await rejectKyc(kycWallet);
                      await revokeInvestor(kycWallet);
                      alert("❌ Rejeté + whitelist OFF.");
                      setReloadFlag((x) => x + 1);
                    } catch (e) {
                      const msg = e?.shortMessage || e?.message || "Erreur reject";
                      setTxError(msg);
                      alert(msg);
                    }
                  }}
                >
                  ❌ Rejeter
                </CrystalButton>
              </div>

              <p className="muted" style={{ marginTop: 12 }}>
                ⚠️ Si tu as l’erreur quota <code>kycForms</code> : ton localStorage est plein.
                Il faut stocker moins (pas d’images/base64), ou passer IndexedDB.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card__body">
              <h3 style={{ marginTop: 0 }}>Vue d’ensemble</h3>
              <div className="stats">
                <div className="stat">
                  <div className="stat__label">En attente</div>
                  <div className="stat__value">{pendingList.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Approuvés</div>
                  <div className="stat__value">{approvedWhitelistedList.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Gelés</div>
                  <div className="stat__value">{approvedFrozenList.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Rejetés</div>
                  <div className="stat__value">{rejectedList.length}</div>
                </div>
              </div>

              <p className="muted" style={{ marginTop: 12 }}>
                La liste vient de <code>localStorage(kycForms)</code> + recoupement on-chain.
              </p>
            </div>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 16 }}>
          <KycListCard
            title="En attente"
            tone="warn"
            items={pendingList}
            isPending={isPending}
            onApprove={async (wallet, form) => {
              if (form?.taxCountry && form.taxCountry !== "France") {
                alert("Compliance: résidence fiscale ≠ France.");
                return;
              }
              await approveKyc(wallet);
              await verifyInvestor(wallet);
              setReloadFlag((x) => x + 1);
            }}
            onReject={async (wallet) => {
              await rejectKyc(wallet);
              await revokeInvestor(wallet);
              setReloadFlag((x) => x + 1);
            }}
            canApprove={(it) => it.exists && !it.approved && !it.rejected}
            canReject={(it) => it.exists && !it.rejected}
          />

          <KycListCard
            title="Approuvés (whitelist ON)"
            tone="ok"
            items={approvedWhitelistedList}
            isPending={isPending}
            onFreeze={async (wallet) => {
              await revokeInvestor(wallet);
              setReloadFlag((x) => x + 1);
            }}
            onReject={async (wallet) => {
              await rejectKyc(wallet);
              await revokeInvestor(wallet);
              setReloadFlag((x) => x + 1);
            }}
            showApprove={false}
            showFreeze
          />

          <KycListCard
            title="Gelés (KYC ok, achat interdit)"
            tone="warn"
            items={approvedFrozenList}
            isPending={isPending}
            onReWhitelist={async (wallet) => {
              await verifyInvestor(wallet);
              setReloadFlag((x) => x + 1);
            }}
            onReject={async (wallet) => {
              await rejectKyc(wallet);
              await revokeInvestor(wallet);
              setReloadFlag((x) => x + 1);
            }}
            showApprove={false}
            showFreeze={false}
            showReWhitelist
          />

          <KycListCard
            title="Rejetés"
            tone="danger"
            items={rejectedList}
            isPending={isPending}
            onReApprove={async (wallet, form) => {
              if (form?.taxCountry && form.taxCountry !== "FR") {
                alert("Compliance: résidence fiscale ≠ FR.");
                return;
              }
              await approveKyc(wallet);
              await verifyInvestor(wallet);
              setReloadFlag((x) => x + 1);
            }}
            showReject={false}
            showFreeze={false}
            showApprove={false}
            showReWhitelist={false}
            showReApprove
          />
        </div>
      </section>

      {/* ========================== SECTION BIENS ========================== */}
      <section className="section">
        <div className="section__head">
          <h2 style={{ margin: 0 }}>Biens & Security tokens</h2>
          <p className="muted" style={{ margin: 0 }}>
            Création on-chain + édition meta front + publish + vente + soft-delete.
          </p>
        </div>

        {/* ====== CREATE NEW PROPERTY ====== */}
        <div className="card">
          <div className="card__body">
            <h3 style={{ marginTop: 0 }}>Créer un nouveau bien (on-chain)</h3>

            <div className="grid2" style={{ marginTop: 12 }}>
              <div>
                <label className="label">Nom</label>
                <input
                  className="input"
                  value={newHouse.name}
                  onChange={(e) => updateNewHouse("name", e.target.value)}
                  placeholder="Maison Paris 7% 2030"
                />
              </div>

              <div>
                <label className="label">Symbol</label>
                <input
                  className="input"
                  value={newHouse.symbol}
                  onChange={(e) => updateNewHouse("symbol", e.target.value)}
                  placeholder="MP7-30"
                />
              </div>

              <div>
                <label className="label">Max supply</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={newHouse.maxSupply}
                  onChange={(e) => updateNewHouse("maxSupply", e.target.value)}
                  placeholder="100"
                />
              </div>

              <div>
                <label className="label">Project owner</label>
                <input
                  className="input"
                  value={newHouse.projectOwner}
                  onChange={(e) => updateNewHouse("projectOwner", e.target.value)}
                  placeholder="0x..."
                />
              </div>
            </div>

            <div className="actionRow" style={{ marginTop: 12 }}>
              <CrystalButton
                tone="gold"
                disabled={isPending}
                onClick={async () => {
                  try {
                    setTxError(null);
                    const ok = window.confirm("Déployer ce nouveau bien on-chain ?");
                    if (!ok) return;

                    await createHouseOnChain(newHouse);
                    alert("✅ Transaction envoyée. Rafraîchis la liste.");
                    setReloadFlag((x) => x + 1);
                  } catch (e) {
                    const msg = e?.shortMessage || e?.message || "Erreur création bien";
                    setTxError(msg);
                    alert(msg);
                  }
                }}
              >
                ➕ Créer le bien
              </CrystalButton>

              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setNewHouse({ name: "", symbol: "", maxSupply: "100", projectOwner: "" })}
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ====== TOKENS LIST ====== */}
        <div className="card">
          <div className="card__body">
            <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ marginTop: 0 }}>Tokens existants</h3>

              <label className="muted" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={autoActivateAfterLink}
                  onChange={(e) => setAutoActivateAfterLink(e.target.checked)}
                />
                Auto-activer la vente après liaison
              </label>
            </div>

            {loadingTokens && <p className="muted">Chargement…</p>}
            {!loadingTokens && tokens.length === 0 && <p className="muted">Aucun token.</p>}

            {!loadingTokens &&
              tokens.map((t) => {
                const meta = getMeta(t.address);
                const ts = BigInt(t.totalSupply ?? 0n);
                const ms = BigInt(t.maxSupply ?? 0n);
                const maxSupplyNum = Number(ms || 0n);
                const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

                const isLinked = isValidAddress(t.saleContract) && !isZeroAddress(t.saleContract);
                const saleKey = isLinked ? t.saleContract.toLowerCase() : null;
                const saleStatus = saleKey ? saleStatusBySale[saleKey] : null;

                const tokenKey = String(t.address).toLowerCase();
                const tokenActive = Boolean(activeByToken[tokenKey]);

                let adminPricePerTokenEUR = null;
                let adminPercentPerToken = null;
                if (meta.price && maxSupplyNum > 0) {
                  const price = Number(meta.price);
                  adminPricePerTokenEUR = price / maxSupplyNum;
                  adminPercentPerToken = 100 / maxSupplyNum;
                }

                return (
                  <div key={t.address} className="item" style={{ marginTop: 14 }}>
                    <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <strong>{t.name}</strong> <span className="muted">(Security token • {t.symbol})</span>
                        <div className="muted" style={{ marginTop: 6 }}>
                          Token (full): <code>{t.address}</code>
                        </div>
                        <div className="muted">
                          Sale (full): <code>{isLinked ? t.saleContract : ZERO}</code>
                        </div>
                      </div>

                      <div className="flex" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span className={`badge ${tokenActive ? "badge--ok" : "badge--danger"}`}>
                          {tokenActive ? "Token active" : "Token inactive"}
                        </span>

                        {isLinked ? (
                          <span className="badge badge--ok">Sale linked</span>
                        ) : (
                          <span className="badge badge--warn">No sale</span>
                        )}

                        {isLinked && saleStatus?.error && <span className="badge badge--danger">Sale read error</span>}

                        {isLinked && !saleStatus?.error && (
                          <span className={`badge ${saleStatus?.saleActive ? "badge--ok" : "badge--warn"}`}>
                            {saleStatus?.saleActive ? "Sale active" : "Sale inactive"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Supply: {String(ts)} / {String(ms)} • {progress}%
                      </div>
                      <div className="progress">
                        <div className="progress__bar" style={{ width: `${progress}%` }} />
                      </div>

                      {adminPricePerTokenEUR !== null && adminPercentPerToken !== null && (
                        <p className="muted" style={{ marginTop: 8 }}>
                          1 token = <strong>{adminPricePerTokenEUR.toFixed(2)} €</strong> ≈{" "}
                          <strong>{adminPercentPerToken.toFixed(4)} %</strong> du bien
                        </p>
                      )}
                    </div>

                    {/* Publish toggle + Token active toggle + Delete */}
                    <div className="actionRow" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                      <button
                        className={`btn ${meta.published ? "" : "btn--ghost"}`}
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          togglePublish(t.address);
                          alert(meta.published ? "📭 Dépublié" : "📢 Publié");
                          setReloadFlag((x) => x + 1);
                        }}
                      >
                        {meta.published ? "📭 Dépublier" : "📢 Publier"}
                      </button>

                      <button
                        className="btn btn--ghost"
                        type="button"
                        disabled={isPending}
                        onClick={async () => {
                          try {
                            setTxError(null);
                            if (tokenActive) {
                              await deactivateHouseToken(t.address);
                              alert("⛔ Token désactivé (soft-delete on-chain).");
                            } else {
                              await activateHouseToken(t.address);
                              alert("✅ Token ré-activé (on-chain).");
                            }
                            setReloadFlag((x) => x + 1);
                          } catch (e) {
                            const msg = e?.shortMessage || e?.message || "Erreur toggle token active";
                            setTxError(msg);
                            alert(msg);
                          }
                        }}
                      >
                        {tokenActive ? "⛔ Désactiver le token" : "✅ Ré-activer le token"}
                      </button>

                      <button
                        className="btn btn--danger"
                        type="button"
                        disabled={isPending}
                        onClick={async () => {
                          const ok = window.confirm(
                            "⚠️ Supprimer ce bien du market ?\n\n- tx on-chain: deactivateHouseToken\n- local: published=false\n\nConfirmer ?"
                          );
                          if (!ok) return;

                          try {
                            setTxError(null);
                            await deactivateHouseToken(t.address);
                            unpublishAndHideLocal(t.address);
                            alert("🗑️ Bien supprimé (soft-delete on-chain + dépublié).");
                            setReloadFlag((x) => x + 1);
                          } catch (e) {
                            const msg = e?.shortMessage || e?.message || "Erreur suppression bien";
                            setTxError(msg);
                            alert(msg);
                          }
                        }}
                      >
                        🗑️ Supprimer le bien
                      </button>
                    </div>

                    {/* Infos BIEN (editable) */}
                    <div className="grid2" style={{ marginTop: 12 }}>
                      <div>
                        <label className="label">Nom affiché (Market)</label>
                        <input
                          className="input"
                          value={meta.name || ""}
                          onChange={(e) => updatePropertyField(t.address, "name", e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">Adresse</label>
                        <input
                          className="input"
                          value={meta.addressLine || ""}
                          onChange={(e) => updatePropertyField(t.address, "addressLine", e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">Ville</label>
                        <input
                          className="input"
                          value={meta.city || ""}
                          onChange={(e) => updatePropertyField(t.address, "city", e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">Pays</label>
                        <input
                          className="input"
                          value={meta.country || ""}
                          onChange={(e) => updatePropertyField(t.address, "country", e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">Prix du bien (€)</label>
                        <input
                          className="input"
                          type="number"
                          value={meta.price || ""}
                          onChange={(e) => updatePropertyField(t.address, "price", e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">m²</label>
                        <input
                          className="input"
                          type="number"
                          value={meta.sqm || ""}
                          onChange={(e) => updatePropertyField(t.address, "sqm", e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">Pièces</label>
                        <input
                          className="input"
                          type="number"
                          value={meta.rooms || ""}
                          onChange={(e) => updatePropertyField(t.address, "rooms", e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Infos SPV */}
                    <div className="grid2" style={{ marginTop: 12 }}>
                      <div>
                        <label className="label">SPV (nom légal)</label>
                        <input
                          className="input"
                          value={meta.spvName || ""}
                          onChange={(e) => updatePropertyField(t.address, "spvName", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label">Immatriculation</label>
                        <input
                          className="input"
                          value={meta.spvRegistration || ""}
                          onChange={(e) => updatePropertyField(t.address, "spvRegistration", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label">Numéro de contrat</label>
                        <input
                          className="input"
                          value={meta.spvContractNumber || ""}
                          onChange={(e) => updatePropertyField(t.address, "spvContractNumber", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label">Rendement cible (%)</label>
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={meta.yield || ""}
                          onChange={(e) => updatePropertyField(t.address, "yield", e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <label className="label">Description</label>
                      <textarea
                        className="textarea"
                        rows={3}
                        value={meta.description || ""}
                        onChange={(e) => updatePropertyField(t.address, "description", e.target.value)}
                      />
                    </div>

                    {/* ✅ IMAGE DU BIEN (LOCAL ONLY) */}
                    <div style={{ marginTop: 12 }}>
                      <label className="label">Image du bien</label>

                      {meta.imageDataUrl ? (
                        <div style={{ marginTop: 8 }}>
                          <img
                            src={meta.imageDataUrl}
                            alt="Aperçu"
                            style={{
                              width: "100%",
                              maxWidth: 520,
                              borderRadius: 14,
                              border: "1px solid rgba(255,255,255,.16)",
                              display: "block",
                            }}
                          />
                          <div className="actionRow" style={{ marginTop: 10 }}>
                            <button
                              className="btn btn--ghost"
                              type="button"
                              onClick={() => updatePropertyField(t.address, "imageDataUrl", null)}
                            >
                              🗑️ Supprimer l’image
                            </button>
                          </div>
                          <p className="muted" style={{ marginTop: 6 }}>
                            Stockée localement (localStorage). Rien n’est envoyé sur un serveur.
                          </p>
                        </div>
                      ) : (
                        <div style={{ marginTop: 8 }}>
                          <input
                            className="input"
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handlePropertyImageChange(t.address, e.target.files?.[0], updatePropertyField)
                            }
                          />
                          <p className="muted" style={{ marginTop: 6 }}>
                            Stockée localement (localStorage). Si ça sature, on passera à IndexedDB plus tard.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Liaison Sale + Toggle saleActive */}
                    <div style={{ marginTop: 14 }} className="card card--soft">
                      <div className="card__body">
                        <div className="flex between" style={{ gap: 10, flexWrap: "wrap" }}>
                          <strong>Contrat de vente (HouseEthSale)</strong>
                          <code>{isLinked ? t.saleContract : "Aucun"}</code>
                        </div>

                        {isLinked && (
                          <div className="actionRow" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                            <button
                              className="btn"
                              type="button"
                              disabled={isPending || saleStatus?.error}
                              onClick={async () => {
                                try {
                                  setTxError(null);
                                  if (saleStatus?.saleActive) {
                                    await deactivateSale(t.saleContract);
                                    alert("⏸️ Vente désactivée.");
                                  } else {
                                    await activateSale(t.saleContract);
                                    alert("▶️ Vente activée.");
                                  }
                                  setReloadFlag((x) => x + 1);
                                } catch (e) {
                                  const msg = e?.shortMessage || e?.message || "Erreur toggle sale";
                                  setTxError(msg);
                                  alert(msg);
                                }
                              }}
                            >
                              {saleStatus?.saleActive ? "⏸️ Désactiver la vente" : "▶️ Activer la vente"}
                            </button>

                            {!saleStatus?.error && saleStatus?.priceWeiPerToken > 0n && (
                              <span className="muted" style={{ alignSelf: "center" }}>
                                Prix: <strong>{String(saleStatus.priceWeiPerToken)} wei</strong> / token
                              </span>
                            )}
                          </div>
                        )}

                        {!isLinked && (
                          <div style={{ marginTop: 10 }}>
                            <label className="label">Adresse HouseEthSale</label>
                            <input
                              className="input"
                              placeholder="0x..."
                              value={saleInputs[t.address] || ""}
                              onChange={(e) => updateSaleInput(t.address, e.target.value)}
                            />
                            <button
                              className="btn"
                              style={{ marginTop: 10 }}
                              disabled={isPending}
                              onClick={() => handleSetSaleContract(t.address)}
                              type="button"
                            >
                              💾 Lier ce contrat de vente
                            </button>
                          </div>
                        )}

                        {isLinked && (
                          <div style={{ marginTop: 10 }}>
                            {!editSaleMode[t.address] ? (
                              <button className="btn btn--ghost" type="button" onClick={() => toggleEditSale(t.address)}>
                                ✏️ Modifier l’adresse HouseEthSale
                              </button>
                            ) : (
                              <>
                                <label className="label">Nouvelle adresse HouseEthSale</label>
                                <input
                                  className="input"
                                  placeholder="0x..."
                                  value={saleInputs[t.address] || ""}
                                  onChange={(e) => updateSaleInput(t.address, e.target.value)}
                                />
                                <div className="actionRow" style={{ marginTop: 10, gap: 10 }}>
                                  <button
                                    className="btn"
                                    disabled={isPending}
                                    onClick={() => handleSetSaleContract(t.address)}
                                    type="button"
                                  >
                                    💾 Enregistrer
                                  </button>
                                  <button className="btn btn--ghost" type="button" onClick={() => toggleEditSale(t.address)}>
                                    Annuler
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================ SUB COMPONENTS ============================ */
function KycListCard({
  title,
  tone,
  items,
  isPending,
  onApprove,
  onReject,
  onFreeze,
  onReWhitelist,
  onReApprove,
  canApprove,
  canReject,
  showApprove = true,
  showReject = true,
  showFreeze = false,
  showReWhitelist = false,
  showReApprove = false,
}) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="flex between">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <span className={`badge badge--${tone}`}>{items.length}</span>
        </div>

        {items.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            Aucun.
          </p>
        )}

        {items.map((item) => (
          <div key={item.wallet} className="item" style={{ marginTop: 12 }}>
            <div className="flex between">
              <div>
                <strong>
                  {item.form?.lastname} {item.form?.firstname}
                </strong>
                <div className="muted">
                  Wallet: <code>{item.wallet}</code>
                </div>
              </div>

              <span className={`badge badge--${tone}`}>
                {item.rejected ? "Rejected" : item.approved ? (item.isVerified ? "Approved" : "Frozen") : "Pending"}
              </span>
            </div>

            {item.kycHash && (
              <div className="muted" style={{ marginTop: 6 }}>
                Hash: <code>{item.kycHash}</code>
              </div>
            )}

            <div className="actionRow" style={{ marginTop: 10 }}>
              {showApprove && (
                <CrystalButton
                  tone="gold"
                  type="button"
                  disabled={isPending || (canApprove ? !canApprove(item) : false)}
                  onClick={async () => {
                    try {
                      await onApprove?.(item.wallet, item.form);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur approve");
                    }
                  }}
                >
                  ✅ Approuver
                </CrystalButton>
              )}

              {showReApprove && (
                <CrystalButton
                  tone="gold"
                  type="button"
                  disabled={isPending}
                  onClick={async () => {
                    try {
                      await onReApprove?.(item.wallet, item.form);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur re-approve");
                    }
                  }}
                >
                  ✅ Ré-approuver
                </CrystalButton>
              )}

              {showReWhitelist && (
                <CrystalButton
                  tone="gold"
                  type="button"
                  disabled={isPending}
                  onClick={async () => {
                    try {
                      await onReWhitelist?.(item.wallet);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur re-whitelist");
                    }
                  }}
                >
                  ✅ Re-whitelister
                </CrystalButton>
              )}

              {showFreeze && (
                <CrystalButton
                  tone="blue"
                  variant="ghost"
                  type="button"
                  disabled={isPending}
                  onClick={async () => {
                    try {
                      await onFreeze?.(item.wallet);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur freeze");
                    }
                  }}
                >
                  🧊 Révoquer
                </CrystalButton>
              )}

              {showReject && (
                <CrystalButton
                  tone="blue"
                  variant="ghost"
                  type="button"
                  disabled={isPending || (canReject ? !canReject(item) : false)}
                  onClick={async () => {
                    try {
                      await onReject?.(item.wallet);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur reject");
                    }
                  }}
                >
                  ❌ Rejeter
                </CrystalButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
