import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAccount, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { config } from "../web3/wagmiConfig.js";

import { CONTRACTS } from "../config/contracts.js";
import HouseTokenJSON from "../abis/HouseSecurityToken.json";
import IdentityJSON from "../abis/IdentityRegistry.json";
import SaleJSON from "../abis/HouseEthSale.json";

const HouseTokenABI = HouseTokenJSON.abi;
const IdentityABI = IdentityJSON.abi;
const SaleABI = SaleJSON.abi;

const ZERO = "0x0000000000000000000000000000000000000000";
const SEPOLIA_ID = 11155111;

function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str ?? "");
  } catch {
    return fallback;
  }
}

// ceil(a/b) for BigInt
function ceilDiv(a, b) {
  a = BigInt(a);
  b = BigInt(b);
  if (b === 0n) return 0n;
  return (a + b - 1n) / b;
}

function formatEth(wei) {
  try {
    const w = BigInt(wei ?? 0n);
    const int = w / 10n ** 18n;
    const frac = (w % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
    return `${int}.${frac}`;
  } catch {
    return "0";
  }
}

export default function HouseDetail() {
  const { tokenAddress } = useParams();
  const tokenAddr = tokenAddress; // ✅ FIX CRITIQUE

  const { address, isConnected, chain } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [loading, setLoading] = useState(true);
  const [txHash, setTxHash] = useState(null);
  const [txError, setTxError] = useState(null);

  const [token, setToken] = useState(null);
  const [sale, setSale] = useState(null);
  const [isVerified, setIsVerified] = useState(false);

  const [investEth, setInvestEth] = useState("0.05");

  // ✅ meta live update (si admin modifie localStorage)
  const [metaVersion, setMetaVersion] = useState(0);
  useEffect(() => {
    function onStorage(e) {
      if (e.key === "propertyMeta") setMetaVersion((v) => v + 1);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const metaMap = useMemo(
    () => safeParseJSON(localStorage.getItem("propertyMeta") || "{}", {}),
    [metaVersion]
  );

  const meta = useMemo(() => {
    if (!isValidAddress(tokenAddr)) return {};
    return metaMap[String(tokenAddr).toLowerCase()] || {};
  }, [tokenAddr, metaMap]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setTxError(null);

        if (!isValidAddress(tokenAddr)) {
          throw new Error("Token introuvable (adresse invalide).");
        }

        const [name, symbol, totalSupply, maxSupply, saleContract] = await Promise.all([
          readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "name" }),
          readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "symbol" }),
          readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "totalSupply" }),
          readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "maxSupply" }),
          readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "saleContract" }),
        ]);

        const ts = BigInt(totalSupply ?? 0n);
        const ms = BigInt(maxSupply ?? 0n);
        const remaining = ms > ts ? ms - ts : 0n;

        const tokenObj = {
          address: tokenAddr,
          name,
          symbol,
          totalSupply: ts,
          maxSupply: ms,
          remaining,
          saleContract,
        };

        let saleObj = null;

        if (isValidAddress(saleContract) && saleContract !== ZERO) {
          const [saleActive, priceWeiPerToken, minInvestWei] = await Promise.all([
            readContract(config, { address: saleContract, abi: SaleABI, functionName: "saleActive" }),
            readContract(config, { address: saleContract, abi: SaleABI, functionName: "priceWeiPerToken" }),
            readContract(config, { address: saleContract, abi: SaleABI, functionName: "MIN_INVEST_WEI" }),
          ]);

          const price = BigInt(priceWeiPerToken ?? 0n);
          const minWei = BigInt(minInvestWei ?? 0n);
          const minTokens = price > 0n ? ceilDiv(minWei, price) : 0n;
          const minFeasible = minTokens <= remaining && remaining > 0n;

          saleObj = {
            address: saleContract,
            saleActive: Boolean(saleActive),
            priceWeiPerToken: price,
            minInvestWei: minWei,
            minTokens,
            minFeasible,
          };
        }

        let verified = false;
        if (address && isValidAddress(address)) {
          const v = await readContract(config, {
            address: CONTRACTS.identityRegistry,
            abi: IdentityABI,
            functionName: "isVerified",
            args: [address],
          });
          verified = Boolean(v);
        }

        if (!cancelled) {
          setToken(tokenObj);
          setSale(saleObj);
          setIsVerified(verified);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setTxError(e?.shortMessage || e?.message || "Erreur chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tokenAddr, address]);

  const investWei = useMemo(() => {
    const s = String(investEth || "").trim();
    if (!s || !/^\d+(\.\d{0,18})?$/.test(s)) return null;
    const [a, b = ""] = s.split(".");
    const frac = (b + "0".repeat(18)).slice(0, 18);
    return BigInt(a) * 10n ** 18n + BigInt(frac);
  }, [investEth]);

  const tokensToBuy = useMemo(() => {
    if (!sale || !token || investWei === null) return 0n;
    if (sale.priceWeiPerToken <= 0n) return 0n;
    return investWei / sale.priceWeiPerToken; // floor comme dans le contrat
  }, [sale, token, investWei]);

  const willRevertReason = useMemo(() => {
    if (!isConnected) return "Connecte ton wallet.";
    if (chain?.id !== SEPOLIA_ID) return "Réseau incorrect : Sepolia requis.";
    if (!token) return "Token indisponible.";
    if (!sale) return "Vente non configurée (saleContract vide).";
    if (!sale.saleActive) return "Vente inactive.";
    if (!isVerified) return "Wallet non KYC (IdentityRegistry).";
    if (token.remaining === 0n) return "Plus de tokens disponibles.";
    if (investWei === null) return "Montant ETH invalide.";
    if (investWei <= 0n) return "Montant ETH nul.";
    if (investWei < sale.minInvestWei) return `Minimum investissement: ${formatEth(sale.minInvestWei)} ETH.`;

    // ✅ cas important : min impossible vs supply restante
    if (!sale.minFeasible) {
      return `Min investissement impossible: il reste ${String(token.remaining)} tokens mais min = ${String(sale.minTokens)}. Ajuste prix/min/maxSupply.`;
    }

    if (tokensToBuy === 0n) return "Montant trop bas pour 1 token au prix actuel.";
    if (tokensToBuy > token.remaining) return `Tu demandes ${String(tokensToBuy)} tokens mais il ne reste que ${String(token.remaining)}. Baisse le montant.`;

    return null;
  }, [isConnected, chain?.id, token, sale, isVerified, investWei, tokensToBuy]);

  async function handleBuy() {
    setTxHash(null);
    setTxError(null);

    const reason = willRevertReason;
    if (reason) {
      setTxError(reason);
      return;
    }

    try {
      const hash = await writeContractAsync({
        address: sale.address,
        abi: SaleABI,
        functionName: "buyTokens",
        args: [],
        value: investWei,
      });

      setTxHash(hash);
      await waitForTransactionReceipt(config, { hash });
    } catch (e) {
      console.error(e);
      setTxError(e?.shortMessage || e?.message || "Erreur transaction");
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body">
            <p className="muted">Chargement…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body">
            <p className="muted">{txError || "Token introuvable."}</p>
            <p className="muted" style={{ marginTop: 8 }}>
              URL param tokenAddress: <code>{String(tokenAddr)}</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="card__body">
          <h1 style={{ marginTop: 0 }}>{meta.name || token.name}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Token: <code>{token.address}</code>
          </p>

          <div className="muted" style={{ marginTop: 10 }}>
            Supply: {String(token.totalSupply)} / {String(token.maxSupply)} • Reste:{" "}
            <strong>{String(token.remaining)}</strong>
          </div>

          {meta.imageDataUrl && (
            <div style={{ marginTop: 12 }}>
              <img
                src={meta.imageDataUrl}
                alt="bien"
                style={{ width: "100%", borderRadius: 16 }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card__body">
          <h3 style={{ marginTop: 0 }}>Investir</h3>

          {!sale && (
            <p className="muted">
              Vente non configurée : <code>saleContract</code> est vide. Configure-la dans l’admin.
            </p>
          )}

          {sale && (
            <div className="muted" style={{ display: "grid", gap: 6 }}>
              <div>
                Sale: <code>{sale.address}</code>
              </div>
              <div>
                Statut: <strong>{sale.saleActive ? "active" : "inactive"}</strong>
              </div>
              <div>
                Prix: <strong>{formatEth(sale.priceWeiPerToken)} ETH</strong> / token
              </div>
              <div>
                Min invest: <strong>{formatEth(sale.minInvestWei)} ETH</strong> → min tokens:{" "}
                <strong>{String(sale.minTokens)}</strong>
              </div>

              {!sale.minFeasible && (
                <div>
                  <span className="badge badge--danger">
                    Min impossible avec la supply restante ({String(token.remaining)})
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label className="label">Montant ETH</label>
            <input
              className="input"
              value={investEth}
              onChange={(e) => setInvestEth(e.target.value)}
              placeholder="0.05"
            />
            {sale && investWei !== null && (
              <p className="muted" style={{ marginTop: 8 }}>
                Tu achètes <strong>{String(tokensToBuy)}</strong> token(s) (reste{" "}
                {String(token.remaining)}).
              </p>
            )}
          </div>

          {txError && (
            <p style={{ marginTop: 12 }}>
              <span className="badge badge--danger">Erreur</span>{" "}
              <span className="muted">{txError}</span>
            </p>
          )}

          {txHash && (
            <p style={{ marginTop: 12 }}>
              Preuve d’envoi (TX): <code>{txHash}</code>{" "}
              <a
                className="link"
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir ↗
              </a>
            </p>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              className="crystalBtn crystalBtn--gold"
              type="button"
              disabled={isPending || Boolean(willRevertReason)}
              onClick={handleBuy}
            >
              <span className="crystalBtn__shimmer" />
              <span style={{ position: "relative", zIndex: 2 }}>
                {isPending ? "Envoi…" : "Acheter"}
              </span>
            </button>

            {willRevertReason && (
              <p className="muted" style={{ marginTop: 8 }}>
                ℹ️ {willRevertReason}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
