import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { readContract } from "wagmi/actions";
import { config } from "../web3/wagmiConfig.js";

import { CONTRACTS } from "../config/contracts.js";
import TokenFactoryJSON from "../abis/TokenFactory.json";
import HouseTokenJSON from "../abis/HouseSecurityToken.json";
import SaleJSON from "../abis/HouseEthSale.json";

import CrystalButton from "../components/CrystalButton.jsx";

const TokenFactoryABI = TokenFactoryJSON.abi;
const HouseTokenABI = HouseTokenJSON.abi;
const SaleABI = SaleJSON.abi;

const ZERO = "0x0000000000000000000000000000000000000000";

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str ?? "");
  } catch {
    return fallback;
  }
}

function riskClass(riskTier) {
  const r = String(riskTier || "").toLowerCase();
  if (r === "low") return "risk--low";
  if (r === "high") return "risk--high";
  return "risk--med";
}

function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

function formatEth(wei) {
  try {
    const w = BigInt(wei ?? 0n);
    // 18 decimals
    const int = w / 10n ** 18n;
    const frac = (w % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
    return `${int}.${frac}`;
  } catch {
    return "0";
  }
}

// ceil(a/b) for BigInt
function ceilDiv(a, b) {
  a = BigInt(a);
  b = BigInt(b);
  if (b === 0n) return 0n;
  return (a + b - 1n) / b;
}

export default function Market() {
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [metaVersion, setMetaVersion] = useState(0);

  const metaMap = useMemo(() => {
    return safeParseJSON(localStorage.getItem("propertyMeta") || "{}", {});
  }, [metaVersion]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === "propertyMeta") setMetaVersion((v) => v + 1);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

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

          const [
            name,
            symbol,
            totalSupply,
            maxSupply,
            isActive,
            saleContract,
          ] = await Promise.all([
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "name" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "symbol" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "totalSupply" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "maxSupply" }),
            readContract(config, { address: CONTRACTS.tokenFactory, abi: TokenFactoryABI, functionName: "isActive", args: [tokenAddr] }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "saleContract" }),
          ]);

          const ts = BigInt(totalSupply ?? 0n);
          const ms = BigInt(maxSupply ?? 0n);
          const remaining = ms > ts ? (ms - ts) : 0n;
          const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

          // meta local
          const key = String(tokenAddr).toLowerCase();
          const meta = metaMap[key] || null;

          // sale info (optional)
          let sale = null;
          if (isValidAddress(saleContract) && saleContract !== ZERO) {
            try {
              const [saleActive, priceWeiPerToken, minInvestWei] = await Promise.all([
                readContract(config, { address: saleContract, abi: SaleABI, functionName: "saleActive" }),
                readContract(config, { address: saleContract, abi: SaleABI, functionName: "priceWeiPerToken" }),
                readContract(config, { address: saleContract, abi: SaleABI, functionName: "MIN_INVEST_WEI" }),
              ]);

              const price = BigInt(priceWeiPerToken ?? 0n);
              const minWei = BigInt(minInvestWei ?? 0n);

              const minTokens = price > 0n ? ceilDiv(minWei, price) : 0n;
              const minFeasible = minTokens <= remaining && remaining > 0n;

              sale = {
                address: saleContract,
                saleActive: Boolean(saleActive),
                priceWeiPerToken: price,
                minInvestWei: minWei,
                minTokens,
                minFeasible,
              };
            } catch (e) {
              sale = { address: saleContract, error: true };
            }
          }

          list.push({
            address: tokenAddr,
            name,
            symbol,
            totalSupply: ts,
            maxSupply: ms,
            remaining,
            progress,
            meta,
            isActive: Boolean(isActive),
            sale,
          });
        }

        const published = list.filter((h) => h.meta && h.meta.published === true && h.isActive === true);

        if (!cancelled) setHouses(published);
      } catch (e) {
        console.error("Erreur load market:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [metaMap]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body">
            <p className="muted">Chargement des biens…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!houses.length) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body" style={{ textAlign: "center" }}>
            <h1>Biens disponibles</h1>
            <p className="muted">Aucun bien n’est publié (ou ils sont inactifs).</p>
            <div style={{ marginTop: 10 }}>
              <button className="btn btn--ghost" onClick={() => setMetaVersion((v) => v + 1)} type="button">
                🔄 Recharger propertyMeta
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="catalogHeader">
        <div>
          <h1 className="catalogTitle">Biens disponibles</h1>
          <div className="catalogMeta">{houses.length} opportunité(s) publiées</div>
        </div>
        <div className="muted">Catalogue • Security tokens</div>
      </div>

      <div className="cards-grid">
        {houses.map((h) => {
          const meta = h.meta || {};
          const location = [meta.city, meta.country].filter(Boolean).join(", ");
          const priceEUR = meta.price ? Number(meta.price) : null;

          const targetYield = meta.yield ? Number(meta.yield) : null;
          const maturity = meta.maturityMonths || meta.maturity || null;
          const riskTier = meta.riskTier || meta.risk || "med";

          const sale = h.sale;
          const hasSale = sale && sale.address && sale.address !== ZERO && !sale.error;

          return (
            <article key={h.address} className="propertyCard">
              <div
                className="propertyCard__media"
                style={
                  meta.imageDataUrl
                    ? { backgroundImage: `url(${meta.imageDataUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : undefined
                }
              />

              <div className="propertyCard__body">
                <div className="propertyCard__top">
                  <div>
                    <h2 className="propertyCard__name">{meta.name || h.name}</h2>
                    <div className="propertyCard__sym">
                      {h.symbol} · {location || "—"}
                    </div>
                  </div>

                  <span className={`pill ${riskClass(riskTier)}`}>
                    <span className="pill__label">Risque</span> {String(riskTier).toUpperCase()}
                  </span>
                </div>

                <div className="pills">
                  <span className="pill">
                    <span className="pill__label">Prix</span>{" "}
                    {priceEUR !== null ? `${priceEUR.toLocaleString("fr-FR")} €` : "—"}
                  </span>

                  <span className="pill">
                    <span className="pill__label">Yield cible</span>{" "}
                    {targetYield !== null ? `${targetYield}%` : "—"}
                  </span>

                  <span className="pill">
                    <span className="pill__label">Maturité</span> {maturity ? `${maturity} mois` : "—"}
                  </span>
                </div>

                <div className="progress">
                  <div className="progress__bar">
                    <div className="progress__fill" style={{ width: `${h.progress}%` }} />
                  </div>
                  <div className="progress__meta">
                    <span>
                      {String(h.totalSupply)} / {String(h.maxSupply)} tokens (reste {String(h.remaining)})
                    </span>
                    <span>{h.progress}%</span>
                  </div>
                </div>

                {/* Infos sale + warning min impossible */}
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  {!hasSale && <div>Vente: <strong>non configurée</strong></div>}
                  {sale?.error && <div>Vente: <strong>erreur lecture</strong></div>}
                  {hasSale && (
                    <>
                      <div>Vente: <strong>{sale.saleActive ? "active" : "inactive"}</strong></div>
                      <div>Prix on-chain: <code>{formatEth(sale.priceWeiPerToken)} ETH</code> / token</div>
                      <div>Min invest: <code>{formatEth(sale.minInvestWei)} ETH</code> → min tokens: <code>{String(sale.minTokens)}</code></div>
                      {!sale.minFeasible && (
                        <div style={{ marginTop: 6 }}>
                          <span className="badge badge--danger">
                            Min 0.05 ETH impossible (reste {String(h.remaining)} tokens)
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="addr">Token: {h.address}</div>

                <div style={{ marginTop: 10 }}>
                  <Link to={`/house/${h.address}`} style={{ display: "inline-block" }}>
                    <CrystalButton tone="gold" type="button">
                      Voir le détail / Investir
                    </CrystalButton>
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
