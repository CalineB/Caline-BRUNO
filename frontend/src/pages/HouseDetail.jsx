// src/pages/HouseDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAccount, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { parseEther } from "viem";

import { config } from "../web3/wagmiConfig.js";
import { CONTRACTS } from "../config/contracts.js";

import HouseTokenJSON from "../abis/HouseSecurityToken.json";
import IdentityJSON from "../abis/IdentityRegistry.json";
import SaleJSON from "../abis/HouseEthSale.json";

const HouseTokenABI = HouseTokenJSON.abi;
const IdentityABI = IdentityJSON.abi;
const SaleABI = SaleJSON.abi;

export default function HouseDetail() {
  const { tokenAddress } = useParams();
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const [tokenInfo, setTokenInfo] = useState(null);
  const [meta, setMeta] = useState(null);
  const [kycVerified, setKycVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  const [ethAmount, setEthAmount] = useState("");
  const [txHash, setTxHash] = useState(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Charger les métadonnées front depuis localStorage
  useEffect(() => {
    try {
      const allMeta = JSON.parse(localStorage.getItem("propertyMeta") || "{}");
      const m =
        allMeta[tokenAddress?.toLowerCase()] || allMeta[tokenAddress] || null;
      setMeta(m || null);
    } catch {
      setMeta(null);
    }
  }, [tokenAddress]);

  // Charger infos du token + adresse du contrat de vente + projectOwner
  useEffect(() => {
    if (!tokenAddress) return;

    async function loadToken() {
      try {
        setLoading(true);

        const [name, symbol, totalSupply, maxSupply, saleContract, projectOwner] =
          await Promise.all([
            readContract(config, {
              address: tokenAddress,
              abi: HouseTokenABI,
              functionName: "name",
            }),
            readContract(config, {
              address: tokenAddress,
              abi: HouseTokenABI,
              functionName: "symbol",
            }),
            readContract(config, {
              address: tokenAddress,
              abi: HouseTokenABI,
              functionName: "totalSupply",
            }),
            readContract(config, {
              address: tokenAddress,
              abi: HouseTokenABI,
              functionName: "maxSupply",
            }),
            readContract(config, {
              address: tokenAddress,
              abi: HouseTokenABI,
              functionName: "saleContract",
            }),
            readContract(config, {
              address: tokenAddress,
              abi: HouseTokenABI,
              functionName: "projectOwner",
            }),
          ]);

        const ts = BigInt(totalSupply ?? 0n);
        const ms = BigInt(maxSupply ?? 0n);
        const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

        setTokenInfo({
          name,
          symbol,
          totalSupply: ts,
          maxSupply: ms,
          progress,
          saleContract,
          projectOwner,
        });
      } catch (err) {
        console.error("Erreur load token:", err);
      } finally {
        setLoading(false);
      }
    }

    loadToken();
  }, [tokenAddress]);

  // Vérifier KYC de l'investisseur connecté
  useEffect(() => {
    if (!address) {
      setKycVerified(false);
      return;
    }

    async function checkKyc() {
      try {
        const res = await readContract(config, {
          address: CONTRACTS.identityRegistry,
          abi: IdentityABI,
          functionName: "isVerified",
          args: [address],
        });
        setKycVerified(Boolean(res));
      } catch (err) {
        console.error("Erreur checkKyc:", err);
        setKycVerified(false);
      }
    }

    checkKyc();
  }, [address]);

  async function handleBuy(e) {
    e.preventDefault();
    if (!isConnected) {
      alert("Connecte ton wallet avant d'investir.");
      return;
    }
    if (!kycVerified) {
      alert("Ton KYC n'est pas encore validé. Va d'abord sur la page KYC.");
      return;
    }
    if (
      !tokenInfo?.saleContract ||
      tokenInfo.saleContract ===
        "0x0000000000000000000000000000000000000000"
    ) {
      alert("Ce bien n'a pas encore de contrat de vente configuré.");
      return;
    }
    if (!ethAmount || Number(ethAmount) <= 0) {
      alert("Montant en ETH invalide.");
      return;
    }

    try {
      const tx = await writeContract({
        address: tokenInfo.saleContract,
        abi: SaleABI,
        functionName: "buyTokens",
        args: [],
        value: parseEther(ethAmount),
      });

      setTxHash(typeof tx === "string" ? tx : tx?.hash ?? JSON.stringify(tx));
      alert("Transaction envoyée sur le testnet.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur achat");
    }
  }

  if (loading || !tokenInfo) {
    return <p>Chargement du bien...</p>;
  }

  // Gestion images : compatibilité imageDataUrl (Admin) + images[]
  const imagesArray = (() => {
    if (meta?.images && Array.isArray(meta.images) && meta.images.length > 0) {
      return meta.images;
    }
    if (meta?.imageDataUrl) {
      return [meta.imageDataUrl];
    }
    return [];
  })();

  const mainImage =
    imagesArray.length > 0
      ? imagesArray[currentImageIndex] || imagesArray[0]
      : null;

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "1.5rem 1rem",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
        gap: "2rem",
      }}
    >
      {/* ------------ COLONNE GAUCHE : IMAGES + DESCRIPTION ------------ */}
      <div>
        {mainImage && (
          <div
            style={{
              width: "100%",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: "0.75rem",
            }}
          >
            <img
              src={mainImage}
              alt={tokenInfo.name}
              style={{
                width: "100%",
                height: "320px",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
        )}

        {/* Mini-galerie */}
        {imagesArray.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              overflowX: "auto",
              paddingBottom: "0.25rem",
            }}
          >
            {imagesArray.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentImageIndex(idx)}
                style={{
                  border:
                    idx === currentImageIndex
                      ? "2px solid #4caf50"
                      : "1px solid #ccc",
                  padding: 0,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "none",
                  cursor: "pointer",
                  minWidth: 80,
                  maxWidth: 120,
                }}
              >
                <img
                  src={img}
                  alt={`thumbnail-${idx}`}
                  style={{
                    width: "100%",
                    height: 70,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: "1rem" }}>
          <h1>{tokenInfo.name}</h1>
          <p style={{ color: "#777" }}>{tokenInfo.symbol}</p>

          {meta && (
            <>
              <p style={{ margin: "0.25rem 0", fontSize: "0.95rem" }}>
                {meta.addressLine && `${meta.addressLine}, `}
                {meta.city}
                {meta.country && `, ${meta.country}`}
              </p>
              <p style={{ margin: "0.25rem 0" }}>
                {meta.price && (
                  <>
                    <strong>Prix du bien :</strong> {meta.price} €
                    {" · "}
                  </>
                )}
                {meta.sqm && (
                  <>
                    <strong>Surface :</strong> {meta.sqm} m²
                    {" · "}
                  </>
                )}
                {meta.rooms && (
                  <>
                    <strong>Nombre d'obligations :</strong> {meta.rooms}
                  </>
                )}
              </p>
              {meta.yield && (
                <p>
                  <strong>Rendement cible :</strong> {meta.yield} %
                </p>
              )}
              {meta.description && (
                <p style={{ marginTop: "0.5rem" }}>{meta.description}</p>
              )}

              {/* Bloc SPV */}
              {(meta.spvName ||
                meta.spvRegistration ||
                meta.spvContractNumber ||
                tokenInfo.projectOwner) && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "0.75rem",
                    borderRadius: 8,
                    border: "1px solid #eee",
                    background: "#fafafa",
                    fontSize: "0.9rem",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>SPV porteuse du bien</h3>
                  {meta.spvName && (
                    <p>
                      <strong>Nom légal :</strong> {meta.spvName}
                    </p>
                  )}
                  {meta.spvRegistration && (
                    <p>
                      <strong>Immatriculation :</strong>{" "}
                      {meta.spvRegistration}
                    </p>
                  )}
                  {meta.spvContractNumber && (
                    <p>
                      <strong>N° de contrat :</strong>{" "}
                      {meta.spvContractNumber}
                    </p>
                  )}
                  {tokenInfo.projectOwner && (
                    <p>
                      <strong>Adresse de la SPV (wallet) :</strong>{" "}
                      <code>{tokenInfo.projectOwner}</code>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ------------ COLONNE DROITE : TOKEN + INVEST ------------ */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: "1rem",
          alignSelf: "flex-start",
        }}
      >
        <h2>Tokenisation du bien</h2>
        <p style={{ fontSize: "0.9rem" }}>
          Adresse du token : <code>{tokenAddress}</code>
        </p>
        {tokenInfo.projectOwner && (
          <p style={{ fontSize: "0.9rem" }}>
            SPV (wallet) : <code>{tokenInfo.projectOwner}</code>
          </p>
        )}
        <p style={{ fontSize: "0.9rem" }}>
          Supply : {String(tokenInfo.totalSupply)} /{" "}
          {String(tokenInfo.maxSupply)} tokens
        </p>

        <div
          style={{
            background: "#eee",
            height: 10,
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 4,
          }}
        >
          <div
            style={{
              width: `${tokenInfo.progress}%`,
              height: "100%",
              background: "#4caf50",
            }}
          />
        </div>
        <p style={{ fontSize: "0.9rem" }}>
          Avancement : {tokenInfo.progress}%
        </p>

        <hr style={{ margin: "1rem 0" }} />

        <h3>Investir en ETH</h3>

        {!isConnected && (
          <p style={{ color: "#d32f2f" }}>
            Connecte ton wallet pour investir.
          </p>
        )}

        {isConnected && !kycVerified && (
          <p style={{ color: "#d32f2f" }}>
            Ton KYC n&apos;est pas encore validé. Va sur la page &quot;KYC&quot;
            pour soumettre tes informations, puis attends l&apos;approbation de
            l&apos;équipe.
          </p>
        )}

        {isConnected &&
          kycVerified &&
          (!tokenInfo.saleContract ||
            tokenInfo.saleContract ===
              "0x0000000000000000000000000000000000000000") && (
            <p style={{ color: "#d32f2f" }}>
              Ce bien n&apos;a pas encore de contrat de vente configuré
              (HouseEthSale). Contacte l&apos;administrateur.
            </p>
          )}

        {isConnected &&
          kycVerified &&
          tokenInfo.saleContract &&
          tokenInfo.saleContract !==
            "0x0000000000000000000000000000000000000000" && (
            <>
              <p style={{ fontSize: "0.85rem" }}>
                Contrat de vente :{" "}
                <code>{tokenInfo.saleContract}</code>
              </p>
              <form
                onSubmit={handleBuy}
                style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}
              >
                <label>
                  Montant en ETH :
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={ethAmount}
                    onChange={(e) => setEthAmount(e.target.value)}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  />
                </label>

                <button type="submit" disabled={isPending}>
                  {isPending
                    ? "Transaction en cours..."
                    : "Acheter des tokens"}
                </button>
              </form>
            </>
          )}

        {txHash && (
          <p style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
            TX envoyée : <code>{txHash}</code>
          </p>
        )}
      </div>
    </div>
  );
}
